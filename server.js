const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./db/database');

const app  = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SSE clients
const sseClients = new Set();

function sendSseEvent(obj) {
  const data = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of sseClients) {
    try { res.write(data); } catch (e) { /* ignore */ }
  }
}

// ── MENÚ ──────────────────────────────────────────────────────────────────────

app.get('/api/menu', (req, res) => {
  const items = db.prepare('SELECT * FROM menu_items WHERE disponible = 1 ORDER BY categoria, id').all();
  res.json(items);
});

app.patch('/api/menu/:id/disponibilidad', (req, res) => {
  const { disponible } = req.body;
  db.prepare('UPDATE menu_items SET disponible = ? WHERE id = ?').run(disponible ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// ── PEDIDOS ───────────────────────────────────────────────────────────────────

app.post('/api/pedidos', (req, res) => {
  const { nombre_cliente, mesa, items } = req.body;

  if (!nombre_cliente?.trim() || !mesa?.trim() || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  const numero_pedido = 'P' + Date.now().toString().slice(-6);
  const total = items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);

  const insertPedido = db.prepare(`
    INSERT INTO pedidos (numero_pedido, nombre_cliente, mesa, total)
    VALUES (@numero_pedido, @nombre_cliente, @mesa, @total)
  `);

  const insertItem = db.prepare(`
    INSERT INTO pedido_items (pedido_id, item_id, nombre, precio, cantidad, notas)
    VALUES (@pedido_id, @item_id, @nombre, @precio, @cantidad, @notas)
  `);

  const crearPedido = db.transaction(() => {
    const { lastInsertRowid } = insertPedido.run({ numero_pedido, nombre_cliente: nombre_cliente.trim(), mesa: mesa.trim(), total });
    items.forEach(i => insertItem.run({
      pedido_id: lastInsertRowid,
      item_id:   i.id,
      nombre:    i.nombre,
      precio:    i.precio,
      cantidad:  i.cantidad,
      notas:     i.notas || '',
    }));
    return lastInsertRowid;
  });

  const id = crearPedido();
  // devolver y notificar a clientes SSE
  const nuevo = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
  nuevo.items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(id);
  res.status(201).json({ id, numero_pedido });
  sendSseEvent({ tipo: 'nuevo_pedido', pedido: nuevo });
});

app.get('/api/pedidos', (req, res) => {
  const { fecha, estado } = req.query;
  let sql = 'SELECT * FROM pedidos WHERE 1=1';
  const params = [];

  if (fecha) {
    sql += ' AND DATE(creado_en) = ?';
    params.push(fecha);
  }
  if (estado) {
    sql += ' AND estado = ?';
    params.push(estado);
  }

  sql += ' ORDER BY creado_en DESC';
  const pedidos = db.prepare(sql).all(...params);

  const pedidosConItems = pedidos.map(p => ({
    ...p,
    items: db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(p.id),
  }));

  res.json(pedidosConItems);
});

app.patch('/api/pedidos/:id/estado', (req, res) => {
  const { estado } = req.body;
  const estados = ['pendiente', 'en preparación', 'listo', 'entregado', 'cancelado'];
  if (!estados.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

  db.prepare('UPDATE pedidos SET estado = ? WHERE id = ?').run(estado, req.params.id);
  const updated = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  updated.items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(req.params.id);
  res.json({ ok: true });
  sendSseEvent({ tipo: 'pedido_actualizado', pedido: updated });
});

// Endpoint SSE para actualizaciones en tiempo real
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  // enviar un ping inicial
  res.write('retry: 2000\n\n');

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// ── ESTADÍSTICAS (inventario) ─────────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  const hoy = new Date().toISOString().split('T')[0];

  const totalHoy    = db.prepare("SELECT COALESCE(SUM(total),0) as v FROM pedidos WHERE DATE(creado_en)=? AND estado!='cancelado'").get(hoy);
  const pedidosHoy  = db.prepare("SELECT COUNT(*) as v FROM pedidos WHERE DATE(creado_en)=?").get(hoy);
  const topItems    = db.prepare(`
    SELECT pi.nombre, pi.emoji, SUM(pi.cantidad) as vendidos, SUM(pi.precio*pi.cantidad) as ingresos
    FROM pedido_items pi
    JOIN pedidos p ON p.id = pi.pedido_id
    WHERE DATE(p.creado_en)=? AND p.estado!='cancelado'
    GROUP BY pi.nombre ORDER BY vendidos DESC LIMIT 5
  `).all(hoy);
  const porEstado   = db.prepare("SELECT estado, COUNT(*) as n FROM pedidos WHERE DATE(creado_en)=? GROUP BY estado").all(hoy);

  res.json({ totalHoy: totalHoy.v, pedidosHoy: pedidosHoy.v, topItems, porEstado });
});

// ── Fallback ──────────────────────────────────────────────────────────────────
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🍽️  Merecunve corriendo en http://localhost:${PORT}`);
  console.log(`📊  Admin en http://localhost:${PORT}/admin.html\n`);
});
