const sqlite3 = require('sqlite3');
const path = require('path');

const EXPENSES = 
`
CREATE TABLE EXPENSES (
    id INTEGER PRIMARY KEY UNIQUE, 
    time INTEGER NOT NULL, 
    amount REAL NOT NULL, 
    description TEXT NOT NULL
)
`;

const BUDGET = 
`
CREATE TABLE BUDGET (
    id INTEGER PRIMARY KEY UNIQUE, 
    title TEXT NOT NULL, 
    amount REAL NOT NULL, 
    parent INTEGER
)
`;

const BUDGET_EXPENSES = 
`
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
)
`;

function create() {
    const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite3'));
    db.run(EXPENSES, (error) => { 
        if (error) {
            throw new Error(error);
        }
        
        db.run(BUDGET, (error) => { 
            if (error) {
                throw new Error(error);
            }
            
            db.run(BUDGET_EXPENSES, (error) => { 
                if (error) {
                    throw new Error(error);
                }
                
                db.close();
            });
        });
    });
    
}

module.exports = {
    EXPENSES: EXPENSES,
    BUDGET: BUDGET,
    BUDGET_EXPENSES: BUDGET_EXPENSES,
    create: create
};