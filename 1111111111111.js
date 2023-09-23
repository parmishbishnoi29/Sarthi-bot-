const { Client } = require('pg');
const TelegramBot = require('node-telegram-bot-api');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { promisify } = require('util');

const BOT_TOKEN = '6295609255:AAH_lz3z07BLkjwgVu6YGHB5WhTjaiZ9Vfs'; // Replace with your Telegram Bot token.
const DB_HOST = 'localhost';
const DB_USER = 'postgres';
const DB_PORT = 5432;
const DB_PASSWORD = 'pk29';
const DB_DATABASE = 'post';

const client = new Client({
    host: DB_HOST,
    user: DB_USER,
    port: DB_PORT,
    password: DB_PASSWORD,
    database: DB_DATABASE
});

client.connect();

const bot = new TelegramBot(BOT_TOKEN);
const usersAwaitingRollNos = {};

// Handle polling errors
bot.on('polling_error', (error) => {
    console.error("Polling Error:", error.message);
});

// Function to fetch student information from the database by roll numbers
async function fetchStudentsByRollNos(rollNos) {
    try {
        const queryText = 'SELECT roll_no, name, age FROM student WHERE roll_no = ANY($1);';
        const res = await client.query(queryText, [rollNos]);
        return res.rows;
    } catch (error) {
        console.error('Database query error:', error.message);
        return [];
    }
}

// Handle /start and /hi commands
bot.onText(/\/start|\/hi/, (msg) => {
    const chatId = msg.chat.id;
    usersAwaitingRollNos[chatId] = true;
    bot.sendMessage(chatId, "Welcome! Please enter student roll numbers separated by commas. Type /done when you're finished.");
});

// Handle /done command to end the session
bot.onText(/\/done/, (msg) => {
    const chatId = msg.chat.id;
    delete usersAwaitingRollNos[chatId];
    bot.sendMessage(chatId, "Session ended. Enter /hi to start a new session.");
});

// Handle incoming messages
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    if (!msg.text) {
        return;
    }

    // If the user is not in the usersAwaitingRollNos list, don't process their message.
    if (!usersAwaitingRollNos[chatId]) {
        return;
    }

    if (msg.text === '/done') {
        bot.sendMessage(chatId, "Session ended. Enter /hi to start a new session.");
        delete usersAwaitingRollNos[chatId];
        return;
    }

    const rollNos = msg.text.split(',').map(rollNo => rollNo.trim());

    if (!rollNos.length) {
        bot.sendMessage(chatId, "Invalid input. Please enter valid student roll numbers separated by commas.");
        return;
    }

    const studentsInfo = await fetchStudentsByRollNos(rollNos);
    if (!studentsInfo.length) {
        bot.sendMessage(chatId, "No results found for the provided roll numbers. Please try again.");
        return;
    }

    async function createPDF(doc, studentsInfo) {
        return new Promise((resolve, reject) => {
            try {
                const buffers = [];
                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => {
                    const pdfBuffer = Buffer.concat(buffers);
                    resolve(pdfBuffer);
                });

                // Add content to the PDF document.
                doc.text('Student Information\n\n');
                studentsInfo.forEach(student => {
                    doc.text(`Roll No: ${student.roll_no}`);
                    doc.text(`Name: ${student.name}`);
                    doc.text(`Age: ${student.age}`);
                    doc.text('\n-----------------\n');
                });

                doc.end(); // Finish the document.
            } catch (error) {
                reject(error);
            }
        });
    }

    // Create a PDF document.
    const doc = new PDFDocument();
    const pdfStream = await createPDF(doc, studentsInfo);

    // Generate a unique filename for the PDF.
    const pdfFileName = `student_info_${Date.now()}.pdf`;

    // Write the PDF to a file.
    const writeFileAsync = promisify(fs.writeFile);
    await writeFileAsync(pdfFileName, pdfStream);

    // Send the PDF file to the user.
    await bot.sendDocument(chatId, pdfFileName, {
        caption: 'Student Information'
    });

    delete usersAwaitingRollNos[chatId]; // End the session after sending the PDF.
});

// Start the bot polling
bot.startPolling();
