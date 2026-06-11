require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./db/database');

const app  = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Servir lanzador en raíz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Servir cliente en /app
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Archivos estáticos públicos
app.use(express.static(path.join(__dirname, 'public')));

// SSE clients
const sseClients = new Set();

function sendSseEvent(obj) {
  const data = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of sseClients) {
    try { res.write(data); } catch (e) { /* ignore */ }
  }
}

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'cambia_esto_por_produccion';

// JWT auth middleware for protected APIs
function jwtAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No auth' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token inválido' });
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

  if (!nombre_cliente?.trim() || !mesa || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  const numero_pedido = 'P' + Date.now().toString().slice(-6);
  const total = items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);

  const insertPedido = db.prepare(`
    INSERT INTO pedidos (numero_pedido, nombre_cliente, mesa, total)
    VALUES (@numero_pedido, @nombre_cliente, @mesa, @total)
  `);

  const insertItem = db.prepare(`
    INSERT INTO pedido_items (pedido_id, item_id, nombre, precio, cantidad, notas, estacion)
    VALUES (@pedido_id, @item_id, @nombre, @precio, @cantidad, @notas, @estacion)
  `);

  const crearPedido = db.transaction(() => {
    const { lastInsertRowid } = insertPedido.run({ numero_pedido, nombre_cliente: nombre_cliente.trim(), mesa: parseInt(mesa), total });
    items.forEach(i => {
      const menuInfo = db.prepare('SELECT estacion FROM menu_items WHERE id = ?').get(i.id) || { estacion: 'cocina' };
      insertItem.run({
        pedido_id: lastInsertRowid,
        item_id:   i.id,
        nombre:    i.nombre,
        precio:    i.precio,
        cantidad:  i.cantidad,
        notas:     i.notas || '',
        estacion:  menuInfo.estacion || 'cocina',
      });
    });
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

// Marcar/unmarcar item como preparado
app.patch('/api/pedido_items/:id/preparado', jwtAuth, (req, res) => {
  const { preparado } = req.body;
  db.prepare('UPDATE pedido_items SET preparado = ? WHERE id = ?').run(preparado ? 1 : 0, req.params.id);
  const item = db.prepare('SELECT * FROM pedido_items WHERE id = ?').get(req.params.id);
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(item.pedido_id);
  pedido.items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(pedido.id);
  sendSseEvent({ tipo: 'item_actualizado', item, pedido });
  res.json({ ok: true });
});

// Login para staff: devuelve JWT
app.post('/api/login', (req, res) => {
  const { user, pass } = req.body || {};
  const USER = process.env.STAFF_USER || 'staff';
  const PASS = process.env.STAFF_PASS || 'm1234';
  if (user === USER && pass === PASS) {
    const token = jwt.sign({ user }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token });
  }
  res.status(401).json({ error: 'Credenciales inválidas' });
});

// Cambiar estación de un menu_item
app.patch('/api/menu/:id/estacion', jwtAuth, (req, res) => {
  const { estacion } = req.body;
  if (!estacion) return res.status(400).json({ error: 'Estación requerida' });
  db.prepare('UPDATE menu_items SET estacion = ? WHERE id = ?').run(estacion, req.params.id);
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  sendSseEvent({ tipo: 'menu_actualizado', item });
  res.json({ ok: true, item });
});

// Vista imprimible de un pedido
app.get('/print/pedido/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).send('Pedido no encontrado');
  const items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(p.id);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pedido ${p.numero_pedido}</title><style>body{font-family:Segoe UI,Arial;} .h{font-weight:800}</style></head><body><h2>Pedido ${p.numero_pedido}</h2><div>Cliente: ${p.nombre_cliente} · Mesa: ${p.mesa}</div><div>Fecha: ${p.creado_en}</div><hr><div>${items.map(i=>`<div>${i.cantidad}× ${i.nombre} ${i.notas?`<div style="font-size:0.9rem;color:#666">📝 ${i.notas}</div>`:''}</div>`).join('')}</div><hr><h3>Total: $${p.total.toLocaleString('es-CO')}</h3><script>window.onload=()=>setTimeout(()=>{window.print();},300);</script></body></html>`;
  res.send(html);
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
    SELECT pi.nombre, SUM(pi.cantidad) as vendidos, SUM(pi.precio*pi.cantidad) as ingresos
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🍽️  Merecunve corriendo en http://localhost:${PORT}`);
  console.log(`📊  Admin en http://localhost:${PORT}/admin.html\n`);
});
