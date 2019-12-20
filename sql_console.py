import os
import sqlite3

# create a default path to connect to and create (if necessary) a database
# called 'database.sqlite3' in the same directory as this script
_dbPath = os.path.join(os.path.dirname(__file__), 'database.sqlite3')

_con = None
_cur = None

def connect():
    global _cur, _con, _dbPath
    _con = sqlite3.connect(_dbPath)
    _cur = _con.cursor()

def close():
    global _cur, _con
    _con.commit()
    _cur.close()
    _con.close()

def main():
    global _cur, _con
    connect()
    while True:
        query = input('sqlite3> ')
    
        if query == 'exit':
            close()
            break
        else:
            try:
                _cur.execute(query)
                if (query.lower().startswith('select')):
                    print(_cur.fetchall())
                _con.commit()
            except Exception as e:
                print(e)


if __name__ == '__main__':
    main()



""" Queries:

CREATE TABLE EXPENSES (
    id INTEGER PRIMARY KEY UNIQUE, 
    time INTEGER NOT NULL, 
    amount REAL NOT NULL, 
    description TEXT NOT NULL
);

CREATE TABLE BUDGET (
    id INTEGER PRIMARY KEY UNIQUE, 
    title TEXT NOT NULL, 
    amount REAL NOT NULL, 
    parent INTEGER
);

CREATE TABLE BUDGET_EXPENSES (
    id INTEGER PRIMARY KEY UNIQUE, 
    e_id TEXT NOT NULL UNIQUE, 
    b_id INTEGER NOT NULL, 
    
    CONSTRAINT fk_expenses
    FOREIGN KEY (e_id)
    REFERENCES EXPENSES(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_budget
    FOREIGN KEY (b_id)
    REFERENCES BUDGET(id)
    ON DELETE CASCADE
);

"""