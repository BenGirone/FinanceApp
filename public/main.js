const user = document.getElementById('user');
const pass = document.getElementById('pass');
const submit = document.getElementById('submit');
const question = document.getElementById('question');
const answer = document.getElementById('answer');
const answer_button = document.getElementById('answer_button');

let status = null;

submit.addEventListener('click', () => {
    if (status && (status === 'IDLE' || status === 'FAIL')) {
        $.post('/login', {
            user: user.value,
            pass: pass.value
        });
    }
});

answer_button.addEventListener('click', () => {
    if (status && status === 'WAITING') {
        $.post('/answer', {
            answer: answer.value
        });
    }
});

async function status_call() {
    let handle = setInterval(() => {
        $.get('/status', (data) => {
            status = data.status;

            if (status === 'WORKING' || status === 'WAITING') {
                submit.setAttribute('disabled', '');
                answer_button.setAttribute('disabled', '');
            }

            if (status === 'WAITING') {
                question.innerHTML = `${data.question}: `;
                answer_button.removeAttribute('disabled');
            }

            if (status === 'IDLE' || status === 'FAIL') {
                submit.removeAttribute('disabled');
                answer_button.setAttribute('disabled');
            }
        });
    }, 3000);
}
status_call();