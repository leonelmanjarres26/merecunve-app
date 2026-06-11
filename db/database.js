const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'merecunve.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS menu_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria  TEXT    NOT NULL,
    emoji      TEXT    NOT NULL,
    nombre     TEXT    NOT NULL,
    descripcion TEXT   NOT NULL,
    precio     INTEGER NOT NULL,
    disponible INTEGER NOT NULL DEFAULT 1,
    creado_en  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_pedido   TEXT    NOT NULL UNIQUE,
    nombre_cliente  TEXT    NOT NULL,
    mesa            TEXT    NOT NULL,
    total           INTEGER NOT NULL,
    estado          TEXT    NOT NULL DEFAULT 'pendiente',
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS pedido_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id  INTEGER NOT NULL REFERENCES pedidos(id),
    item_id    INTEGER NOT NULL,
    nombre     TEXT    NOT NULL,
    precio     INTEGER NOT NULL,
    cantidad   INTEGER NOT NULL,
    notas      TEXT    DEFAULT ''
  );
`);

// Seed del menú solo si está vacío
const count = db.prepare('SELECT COUNT(*) as n FROM menu_items').get();
if (count.n === 0) {
  const insert = db.prepare(`
    INSERT INTO menu_items (categoria, emoji, nombre, descripcion, precio)
    VALUES (@categoria, @emoji, @nombre, @descripcion, @precio)
  `);
  const seed = db.transaction((items) => items.forEach(i => insert.run(i)));
  seed([
    { categoria: 'Entradas',  emoji: '🥗', nombre: 'Ensalada César',     descripcion: 'Lechuga, crutones y aderezo',      precio: 12000 },
    { categoria: 'Entradas',  emoji: '🍲', nombre: 'Sopa del día',        descripcion: 'Crema de tomate casera',           precio: 9000  },
    { categoria: 'Entradas',  emoji: '🧆', nombre: 'Patacones con hogao', descripcion: 'Plátano verde frito con salsa',    precio: 8000  },
    { categoria: 'Platos',    emoji: '🍗', nombre: 'Pollo a la plancha',  descripcion: 'Con arroz y ensalada',             precio: 22000 },
    { categoria: 'Platos',    emoji: '🥩', nombre: 'Lomo de res',         descripcion: 'Con papas fritas y chimichurri',   precio: 28000 },
    { categoria: 'Platos',    emoji: '🐟', nombre: 'Filete de pescado',   descripcion: 'Al limón con verduras al vapor',   precio: 25000 },
    { categoria: 'Platos',    emoji: '🍝', nombre: 'Pasta boloñesa',      descripcion: 'Pasta con carne molida',           precio: 18000 },
    { categoria: 'Bebidas',   emoji: '🧃', nombre: 'Jugo natural',        descripcion: 'Mango, maracuyá o guanábana',      precio: 6000  },
    { categoria: 'Bebidas',   emoji: '☕', nombre: 'Café americano',      descripcion: 'Café de origen colombiano',        precio: 4000  },
    { categoria: 'Bebidas',   emoji: '🥤', nombre: 'Gaseosa',             descripcion: 'Coca-Cola, Sprite o agua',         precio: 3500  },
    { categoria: 'Postres',   emoji: '🍮', nombre: 'Flan de caramelo',    descripcion: 'Casero, cremoso y suave',          precio: 8000  },
    { categoria: 'Postres',   emoji: '🍰', nombre: 'Torta de chocolate',  descripcion: 'Con helado de vainilla',           precio: 10000 },
  ]);
}

module.exports = db;
