import type { capSQLiteVersionUpgrade } from '@capacitor-community/sqlite'

// occurred_at is local-time ISO without zone ('YYYY-MM-DDTHH:MM:SS') so lexical
// order is chronological and substr(1,10)/substr(1,7) give day/month keys.
export const upgrades: capSQLiteVersionUpgrade[] = [
  {
    toVersion: 1,
    statements: [
      `CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        role_note TEXT NOT NULL DEFAULT '',
        reserved INTEGER NOT NULL DEFAULT 0
      );`,
      `CREATE TABLE categories (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        system INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        sort INTEGER NOT NULL
      );`,
      `CREATE TABLE transactions (
        id INTEGER PRIMARY KEY,
        amount INTEGER NOT NULL CHECK (amount > 0),
        kind TEXT NOT NULL CHECK (kind IN ('expense','income','transfer_out','transfer_in','fee')),
        category_id INTEGER REFERENCES categories(id),
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        note TEXT NOT NULL DEFAULT '',
        occurred_at TEXT NOT NULL CHECK (occurred_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*'),
        transfer_group_id TEXT
      );`,
      `CREATE INDEX idx_txn_occurred ON transactions(occurred_at);`,
      `CREATE INDEX idx_txn_group ON transactions(transfer_group_id) WHERE transfer_group_id IS NOT NULL;`,
      `INSERT INTO categories (name, code, system, sort) VALUES
        ('Food','FD',0,1),
        ('Transport','TR',0,2),
        ('Home','HM',0,3),
        ('Leisure','LS',0,4),
        ('Health','HL',0,5),
        ('Other','OT',0,6),
        ('Fee','FE',1,7);`,
    ],
  },
  {
    toVersion: 2,
    statements: [`INSERT INTO accounts (name, role_note, reserved) VALUES ('Cash','',0);`],
  },
  {
    toVersion: 3,
    statements: [`ALTER TABLE accounts ADD COLUMN opening_balance INTEGER NOT NULL DEFAULT 0;`],
  },
  {
    toVersion: 4,
    statements: [
      `ALTER TABLE categories ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','income'));`,
      `INSERT INTO categories (name, code, system, sort, kind)
       VALUES ('Bills','BI',0,(SELECT COALESCE(MAX(sort),0)+1 FROM categories),'expense');`,
      `INSERT INTO categories (name, code, system, sort, kind)
       VALUES ('Shopping','SH',0,(SELECT COALESCE(MAX(sort),0)+1 FROM categories),'expense');`,
      `INSERT INTO categories (name, code, system, sort, kind)
       VALUES ('Groceries','GR',0,(SELECT COALESCE(MAX(sort),0)+1 FROM categories),'expense');`,
      `UPDATE categories SET sort = (SELECT MAX(sort)+1 FROM categories)
       WHERE code = 'OT' AND kind = 'expense';`,
      `INSERT INTO categories (name, code, system, sort, kind)
       VALUES ('Salary','SA',0,(SELECT COALESCE(MAX(sort),0)+1 FROM categories),'income');`,
      `INSERT INTO categories (name, code, system, sort, kind)
       VALUES ('Bonus','BN',0,(SELECT COALESCE(MAX(sort),0)+1 FROM categories),'income');`,
      `INSERT INTO categories (name, code, system, sort, kind)
       VALUES ('Others','OT',0,(SELECT COALESCE(MAX(sort),0)+1 FROM categories),'income');`,
    ],
  },
]
