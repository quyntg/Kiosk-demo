// Đường dẫn file mp3 phát trước và sau khi phát voice (có thể thay đổi tuỳ ý)
var mp3AlertUrl = './data/chuong.mp3';
var mp3BeforeUrl = './data/xin moi.mp3';
var mp3AfterUrl = './data/den quay so.mp3';
var mp3EndUrl = './data/phuc vu.mp3';
var mp30 = './data/0.mp3'; // file mp3 đọc số 0
var mp31 = './data/1.mp3'; // file mp3 đọc số 1
var mp32 = './data/2.mp3'; // file mp3 đọc số 2
var mp33 = './data/3.mp3'; // file mp3 đọc số 3
var mp34 = './data/4.mp3'; // file mp3 đọc số 4
var mp35 = './data/5.mp3'; // file mp3 đọc số 5
var mp36 = './data/6.mp3'; // file mp3 đọc số 6
var mp37 = './data/7.mp3'; // file mp3 đọc số 7
var mp38 = './data/8.mp3'; // file mp3 đọc số 8
var mp39 = './data/9.mp3'; // file mp3 đọc số 9
var ggAPIUrl = 'https://script.google.com/macros/s/AKfycbyRBpCm2EexyJ7boQfaJMSRTnU-g9B2RcyL6R54H1BMPFF_1q-jiIH7znDYMuSSX5kjsA/exec';
var printerId = 75749342; // id test
// var printerId = 75572504; // id mạnh
var apiKey = "cmIEqzm5rM-hHvKxK2v_afDZ2XzGxXjr9s08HkWL9v0";
var printJobUrl = 'https://api.printnode.com/printjobs';
var printerUrl = 'https://api.printnode.com/printers';

const firebaseConfig = {
    apiKey: "AIzaSyAvkf45AjS0u9pLOsPrg-nO2YApGfsOk7U",
    authDomain: "kiosk-demo-f8491.firebaseapp.com",
    databaseURL: "https://kiosk-demo-f8491-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "kiosk-demo-f8491",
    storageBucket: "kiosk-demo-f8491.firebasestorage.app",
    messagingSenderId: "633976743556",
    appId: "1:633976743556:web:1e458ff08ffcca165544d1",
    measurementId: "G-FZHMC5S2B8"
};

var deskList = [
    { name: "Lĩnh vực 1", id: "desk1" },
    { name: "Lĩnh vực 2", id: "desk2" },
    { name: "Lĩnh vực 3", id: "desk3" },
    { name: "Lĩnh vực 4", id: "desk4" },
    { name: "Lĩnh vực 5", id: "desk5" },
    { name: "Lĩnh vực 6", id: "desk6" },
    { name: "Lĩnh vực 7", id: "desk7" },
    { name: "Lĩnh vực 8", id: "desk8" }
]

const spinnerSVG = `
    <svg width="24" height="24" viewBox="0 0 50 50">
        <path d="M25 7
            a 18 18 0 0 1 0 36" 
            stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none" stroke-dasharray="40 80" filter="drop-shadow(0 0 3px #fff)">
            <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.6s" repeatCount="indefinite"/>
        </path>
    </svg>
`;

const orangeSpinnerSVG = `
    <svg width="64" height="64" viewBox="0 0 50 50">
        <path d="M25 7
            a 18 18 0 0 1 0 36" 
            stroke="#ff9800" stroke-width="8" stroke-linecap="round" fill="none" 
            stroke-dasharray="40 80" filter="drop-shadow(0 0 6px #ff9800)">
            <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.7s" repeatCount="indefinite"/>
        </path>
    </svg>
`;
