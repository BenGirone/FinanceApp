const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const tables = require('./tables');

//--- Global Values and Modifying Functions ---//
function db_awaitable_run(db, sql) { 
    return new Promise(
        (resolve, reject) => { db.run(sql, (error) => { if (error) { throw new Error(error); } resolve(0); }); } 
    );
}

function db_awaitable_all(db, sql) { 
    return new Promise(
        (resolve, reject) => { db.all(sql, (error, rows) => { if (error) { throw new Error(error); } resolve(rows); }); }
    );
}

const newExpenseStatement = (time, amount, description) => `INSERT INTO EXPENSES (time, amount, description) VALUES (${time}, ${amount}, "${description}")`;
const deleteExpenseStatement = (time, amount, description, recordsToRemove = 1) => `DELETE FROM EXPENSES WHERE id in (SELECT id FROM EXPENSES WHERE time=${time} AND amount=${amount} AND description="${description}" LIMIT ${recordsToRemove})`
const newBudgetStatement = (title, amount, parent) => (parent ? `INSERT INTO EXPENSES (title, amount, parent) VALUES (${title}, ${amount}, ${parent})` : `INSERT INTO EXPENSES (title, amount) VALUES (${title}, ${amount})`);
const newBudgetExpenseStatement = (e_id, b_id) => `INSERT INTO EXPENSES (e_id, b_id) VALUES (${e_id}, ${b_id})`;
const getExpensesByTimeStatement = (fromDate, toDate) => `SELECT * FROM EXPENSES WHERE time >= ${(new Date(fromDate)).getTime() / 1000} AND time <= ${(new Date(toDate)).getTime() / 1000} ORDER BY time DESC`;

const regex = new RegExp('\\"([0-9]+\\/[0-9]+\\/[0-9]+)\\",\\"([^\\"]+)\\",\\"\\$([0-9,]+\\.[0-9]+)\\"');

const port = 8080;

const state = {
    IDLE: 'IDLE',
    WORKING: 'WORKING',
    WAITING: 'WAITING',
    FAIL: 'FAIL'
}

let browser;

// Should only be modified in the app.post('/answer') or getAnswer function
let _answer = undefined;
let _question = undefined;

// Should only be modified in the changeStatus function
let _status = state.IDLE;
let _statusExpire = undefined;

function changeStatus(status, maxTime) {
    _status = status;
    
    if (maxTime) {
        _statusExpire = Date.now() + maxTime;
    } else {
        _statusExpire = undefined;
    }
}

async function statusTimeout() {
    setInterval(() => {
        if (_statusExpire && Date.now() > _statusExpire) {
            if (browser) {
                console.error('State timed out');
                browser.close();
                changeStatus(state.FAIL);
            }
        }
    }, 2000);
}
statusTimeout();


//--- Server Configuration and Functions ---//


// parse application/json
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

app.get('/data', (req, res) => {
    console.log('Getting data from ' + req.query.fromDate + ' to ' + req.query.toDate);
    const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite3'));
    db.all(getExpensesByTimeStatement(req.query.fromDate, req.query.toDate), (error, rows) => {
        if (error) {
            console.error(error);
            res.send('Error').status(503);
        } else {
            console.log(rows);
            res.send(rows).status(200);
        }

        db.close();
    });
});

app.get('/status', (req, res) => {
    res.send({status: _status, question: _question}).status(200);
});

app.post('/login', (req, res) => {
    if (_status === state.IDLE || _status === state.FAIL) {
        try {
            changeStatus(state.WORKING, 60 * 1000);
            scrape(req.body.user, req.body.pass);
        } catch(error) {
            console.error(error);

            if (browser) {
                browser.close();
                changeStatus(state.FAIL);
            }
        }

        res.send('').status(200);
    } else {
        res.send('Update in progress').status(200);
    }
});

app.post('/answer', (req, res) => {
    _answer = req.body.answer;
    res.send('').status(200);
});

app.use('/', express.static('public'));

app.listen(port, () => console.log(`Bank app listening on port ${port}!`));


//--- Scraping Functions ---//


async function forcefulType(element, text) {
    for (character of text) {
        await element.focus();
        await element.type(character);
    }

    return 0;
}

function waitForDownload(cardNumber) {
    return new Promise((resolve, reject) => {
        let handle = setInterval(() => {
            if (fs.existsSync(path.join(__dirname, 'creditCardActivityExport.csv'))) {
                if (fs.existsSync(path.join(__dirname, `card${cardNumber}.csv`))) {
                    fs.unlinkSync(path.join(__dirname, `card${cardNumber}.csv`));
                }
        
                fs.renameSync(path.join(__dirname, 'creditCardActivityExport.csv'), path.join(__dirname, `card${cardNumber}.csv`));

                clearInterval(handle);
                resolve(0);
            }
        }, 200);
    });
}

function getAnswer() {
    return new Promise((resolve, reject) => {
        let handle = setInterval(() => {
            if (_answer) {
                const _answerReturn = _answer;

                _answer = undefined;

                changeStatus(state.WORKING);

                clearInterval(handle);

                resolve(_answerReturn);
            }
        }, 200);
    });
}

async function scrape(user, pass) {
    const now = new Date();
    const then = new Date();
    then.setDate(1);
    then.setMonth(now.getMonth() - 10);
    const fromDate = `${('0' + (then.getMonth() + 1)).slice(-2)}/01/${then.getFullYear()}`;
    const toDate = `${('0' + (now.getMonth() + 1)).slice(-2)}/${('0' + now.getDate()).slice(-2)}/${now.getFullYear()}`;

    console.log('Starting browser');
    browser = await puppeteer.launch({
        args: [
        '--no-sandbox',
        '--headless',
        '--disable-gpu',
        '--window-size=1920x1080'
    ]});

    console.log('Making page');
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.90 Safari/537.36');
    await page._client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: __dirname });
    
    let frame = undefined;
    while (!frame) {
        console.log('Navigating');
        await page.goto('https://www.onlinebanking.pnc.com/alservlet/PNCOnlineBankingServletLogin');
    
        frame = page.frames().filter(f => f.name() === 'center')[0];
    }
    
    console.log('Logging in');
    const userId = await frame.waitForSelector('input[name="userId"]');
    await forcefulType(userId, user);
    
    const password = await frame.waitForSelector('input[name="password"]');
    await forcefulType(password, pass + String.fromCharCode(13));

    const answer = await Promise.race([frame.waitForSelector('input[name="answer"]', {visible: true}), frame.waitForSelector('.ccAccount', {visible: true})]);
    if (answer._remoteObject.className === 'HTMLInputElement') {
        _question = await frame.evaluate(() => { return document.querySelector('.CobrowseBlock').innerHTML });
        changeStatus(state.WAITING, 60 * 1000);
        
        await forcefulType(answer, (await getAnswer()) + String.fromCharCode(13));
        
        await frame.waitForSelector('.ccAccount');
    }

    let cardCounter = 0;

    const cards = await frame.$$('.ccAccount');
    for (const card of cards) {
        await frame.waitForSelector('.ccAccount'); // since we are looping, make sure we are seeing cc acounts

        (await card.$('a')).click();

        (await frame.waitForSelector('#CC-TransDataPending .right a', {visible: true})).click();

        const fromDateInput = await frame.waitForSelector('input[name="fromDate"]', {visible: true});
        await forcefulType(fromDateInput, fromDate);

        const toDateInput= await frame.waitForSelector('input[name="toDate"]', {visible: true});
        await forcefulType(toDateInput, toDate);

        (await frame.waitForSelector('#loanSearch .formButton', {visible: true})).click();

        await frame.waitForSelector('.tableColHeader', {visible: true});
        console.log('Downloading');
        await frame.evaluate(() => {submitExport('0')});

        await waitForDownload(cardCounter);
        console.log('File Downloaded');

        cardCounter++;
    }

    await browser.close();
    console.log('Browser Closed');
    
    if (!fs.existsSync(path.join(__dirname, 'database.sqlite3'))) {
        tables.create();
    }
    
    const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite3'));
    
    const new_rows = [];

    for (let i = 0; i < cardCounter; i++) {
        const contents = fs.readFileSync(path.join(__dirname, `card${i}.csv`)).toString().split('\n').slice(1);
        
        for (const record of contents) {
            if (record && record !== '') {
                try {
                    const raw = record.match('\\"([0-9]+\\/[0-9]+\\/[0-9]+)\\",\\"([^\\"]+)\\",\\"([-]*\\$[0-9,]+\\.[0-9]+)\\"').slice(1);

                    new_rows.push({
                        time: new Date(raw[0]).getTime() / 1000,
                        description: raw[1],
                        amount: parseFloat(raw[2].replace(',', '').replace('$', ''))
                    });
                } catch(error) {
                    console.log('failed on: ' + record);
                    
                    changeStatus(state.FAIL);
                    
                    throw new Error(error);
                }
            }
        }
    }

    console.log('Data Parsed');

    const row_equality = (r1, r2) => (r1.time === r2.time && r1.description === r2.description && r1.amount === r2.amount);

    const row_count = (row, list) => list.reduce((counter, rowToCount) => { if (row_equality(rowToCount, row)) { return counter + 1; } else { return counter; } }, 0);

    const unique_rows = (rows) => rows.reduce((unique, row) => { if (row_count(row, unique) === 0) { return unique.concat([row]); } else { return unique; } }, []);

    const rows = await db_awaitable_all(db, getExpensesByTimeStatement(fromDate, toDate));

    console.log('Merging Data');

    for (const row of unique_rows(new_rows)) {
        const recordsToAdd = row_count(row, new_rows) - row_count(row, rows);;
        if (recordsToAdd > 0) {
            for (let i = 0; i < recordsToAdd; i++) {
                await db_awaitable_run(db, newExpenseStatement(row.time, row.amount, row.description));
            }
        }
    }

    for (const row of unique_rows(rows)) {
        const recordsToRemove = row_count(row, rows) - row_count(row, new_rows);

        if (recordsToRemove > 0) {
            await db_awaitable_run(db, deleteExpenseStatement(row.time, row.amount, row.description, recordsToRemove));
        }
    }

    db.close();

    changeStatus(state.IDLE);

    console.log('Done');
}