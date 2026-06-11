// Script de prueba: login, crear pedido y marcar item preparado
const BASE = process.env.BASE || 'http://localhost:3000';
const STAFF_USER = process.env.STAFF_USER || 'staff';
const STAFF_PASS = process.env.STAFF_PASS || 'm1234';

async function run(){
  const fetch = global.fetch;
  console.log('Login...');
  let r = await fetch(BASE + '/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({user:STAFF_USER, pass:STAFF_PASS})});
  if(!r.ok){ console.error('Login falló', await r.text()); return; }
  const data = await r.json();
  const token = data.token;
  console.log('Token obtenido');

  // Crear pedido
  const body = {
    nombre_cliente: 'AutoTest',
    mesa: '99',
    items: [{ id: 1, nombre: 'Ensalada César', precio: 12000, cantidad: 1, notas: 'sin aderezo' }]
  };
  r = await fetch(BASE + '/api/pedidos', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  if(!r.ok){ console.error('Crear pedido falló', await r.text()); return; }
  const pedido = await r.json();
  console.log('Pedido creado:', pedido);

  // Obtener pedido con items
  r = await fetch(BASE + '/api/pedidos');
  const pedidos = await r.json();
  const p = pedidos.find(x => x.id === pedido.id);
  if(!p){ console.error('No encontré el pedido'); return; }
  const item = p.items[0];
  console.log('Item id:', item.id);

  // Marcar item como preparado
  r = await fetch(BASE + `/api/pedido_items/${item.id}/preparado`, {method:'PATCH', headers:{'Content-Type':'application/json','Authorization':'Bearer ' + token}, body: JSON.stringify({preparado:true})});
  if(!r.ok){ console.error('Marcar preparado falló', await r.text()); return; }
  console.log('Item marcado como preparado');

  // Verificar
  r = await fetch(BASE + '/api/pedidos');
  const pedidos2 = await r.json();
  const p2 = pedidos2.find(x => x.id === pedido.id);
  console.log('Pedido final:', JSON.stringify(p2, null, 2));
}

run().catch(e=>{ console.error(e); process.exit(1); });
