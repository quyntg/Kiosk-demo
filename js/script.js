/**
 * script.js
 * Reorganized: globals, init, utilities, Firebase helpers,
 * routing/login, gate, desk, admin, daily update and diagnostics.
 */

// -----------------------------
// Globals & Firebase init
// -----------------------------
let queue = [{
    number: 'A001',
    name: 'Nguyễn Văn A'
}, {
    number: 'A002',
    name: 'Trần Thị B'
}];
let current = null;
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database();
let fs = null;
try {
    if (firebase && firebase.firestore) fs = firebase.firestore();
} catch (e) {
    console.warn('Firestore not available', e);
}

// -----------------------------
// Utilities
// -----------------------------
function removeVietnameseTones(str) {
    return str.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

function toBase64(str) {
    return btoa(Array.from(str).map(c => String.fromCharCode(c.charCodeAt(0) & 0xFF)).join(''));
}

function buildTicket(counter) {
    const parts = [
        '\x1B\x61\x01', '\x1D\x21\x01', removeVietnameseTones('TRUNG TAM HANH CHINH CONG XA ABC') + '\n',
        removeVietnameseTones('THANH HOA') + '\n', '------------------------------------------\n',
        removeVietnameseTones('PHIEU SO THU TU') + '\n', '------------------------------------------\n\n',
        '\x1B\x61\x01', '\x1D\x21\x33', counter + '\n', '\x1D\x21\x01', '\n',
        removeVietnameseTones('Vui long cho den luot') + '\n', '\n\n\n', '\x1D\x21\x00', '\x1D\x56\x42\x10'
    ];
    return parts.join('');
}

async function printTicket(counter) {
    const raw = buildTicket(counter);
    const contentBase64 = toBase64(raw);
    const body = {
        printerId: printerId,
        title: 'Queue Ticket',
        contentType: 'raw_base64',
        content: contentBase64
    };
    await fetch(printJobUrl, {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + btoa(apiKey),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
}

async function printWithPrintNode() {
    const body = {
        printerId: printerId,
        title: 'Test Print',
        contentType: 'raw_base64',
        content: btoa('Hello Thermal Printer\n\n\n')
    };
    const res = await fetch(printJobUrl, {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + btoa(apiKey + ':'),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function listPrinters() {
    const res = await fetch(printerUrl, {
        headers: {
            'Authorization': 'Basic ' + btoa(apiKey + ':')
        }
    });
    return res.json();
}

// -----------------------------
// Firestore helpers
// -----------------------------
// Find schedule document reference by doc ID or by field `id`.
function findScheduleDocRef(id) {
    if (!fs) return Promise.resolve(null);
    return fs.collection('schedules').doc(id).get().then(doc => {
        if (doc.exists) return fs.collection('schedules').doc(doc.id);
        return fs.collection('schedules').where('id', '==', id).limit(1).get().then(q => {
            if (!q.empty) return fs.collection('schedules').doc(q.docs[0].id);
            return null;
        });
    });
}

function firestoreCallCounterById(id, counter) {
    return findScheduleDocRef(id).then(ref => {
        if (!ref) return {
            success: false
        };
        return ref.update({
            processing: counter,
            status: 'processing'
        }).then(() => ({
            success: true,
            text: String(counter)
        })).catch(err => {
            console.error('firestoreCallCounterById error', err);
            return {
                success: false
            };
        });
    }).catch(err => {
        console.error('firestoreCallCounterById find error', err);
        return {
            success: false
        };
    });
}

function firestoreUpdateProcessing(id, counter, type) {
    return findScheduleDocRef(id).then(ref => {
        if (!ref) return {
            success: false
        };
        return fs.runTransaction(tx => tx.get(ref).then(docSnap => {
            if (!docSnap.exists) throw new Error('Schedule not found in txn');
            const data = docSnap.data() || {};
            let queueArr = [];
            if (Array.isArray(data.queue)) queueArr = data.queue.slice();
            else if (typeof data.queue === 'string' && data.queue.length) queueArr = data.queue.split(',').filter(x => x);
            queueArr = queueArr.filter(num => String(num) !== String(counter));
            const updates = {
                queue: queueArr,
                processing: '',
                status: 'waiting'
            };
            if (type == 1) {
                const doneVal = parseInt(data.done, 10) || 0;
                updates.done = doneVal + 1;
            } else if (type == 0) {
                const skipVal = parseInt(data.skip, 10) || 0;
                updates.skip = skipVal + 1;
            }
            tx.update(ref, updates);
            return {
                success: true
            };
        })).catch(err => {
            console.error('firestoreUpdateProcessing txn error', err);
            return {
                success: false
            };
        });
    }).catch(err => {
        console.error('firestoreUpdateProcessing find error', err);
        return {
            success: false
        };
    });
}

function getScheduleById(id) {
    if (!fs) return Promise.resolve({
        success: false
    });
    return fs.collection('schedules').doc(id).get().then(doc => {
        if (doc.exists) {
            const data = doc.data() || {};
            let queueArr = [];
            if (Array.isArray(data.queue)) queueArr = data.queue.map(x => String(x));
            else if (typeof data.queue === 'string') queueArr = data.queue.split(',').filter(x => x).map(x => String(x));
            else if (typeof data.queue === 'number') queueArr = [String(data.queue)];
            return Object.assign({
                success: true,
                id: doc.id,
                queue: queueArr
            }, data);
        }
        return fs.collection('schedules').where('id', '==', id).limit(1).get().then(q => {
            if (!q.empty) {
                const doc2 = q.docs[0];
                const data = doc2.data() || {};
                let qa = [];
                if (Array.isArray(data.queue)) qa = data.queue.map(x => String(x));
                else if (typeof data.queue === 'string') qa = data.queue.split(',').filter(x => x).map(x => String(x));
                else if (typeof data.queue === 'number') qa = [String(data.queue)];
                return Object.assign({
                    success: true,
                    id: doc2.id,
                    queue: qa
                }, data);
            }
            return {
                success: false
            };
        }).catch(err => {
            console.error('Firestore getScheduleById error', err);
            return {
                success: false
            };
        });
    });
}

// -----------------------------
// Routing and page loader
// -----------------------------
function loadPage(url, id) {
    const appEl = document.getElementById(id);
    return fetch(url).then(res => res.text()).then(html => {
        appEl.innerHTML = html;
        if (url.includes('login')) {
            setTimeout(() => {
                const spinner = document.getElementById('loginSpinner');
                if (spinner) {
                    spinner.style.display = 'none';
                    spinner.innerHTML = '';
                }
            }, 10);
        }
        if (url.includes('gate')) {
            setTimeout(() => {
                if (typeof trySetCurrentDateAndRunDailyUpdate === 'function') trySetCurrentDateAndRunDailyUpdate().catch(console.error);
            }, 50);
        }
        if (url.includes('admin')) {
            setTimeout(() => {
                if (typeof initAdminPage === 'function') {
                    try {
                        initAdminPage();
                    } catch (e) {
                        console.error('initAdminPage error', e);
                    }
                }
            }, 50);
        }
    }).catch(() => {
        appEl.innerHTML = '<h2>Page not found</h2>';
    });
}

// -----------------------------
// Login flow
// -----------------------------
function login(username, password) {
    const errorMsg = document.getElementById('errorMsg');
    const btn = document.getElementById('loginBtn');
    const btnText = document.getElementById('loginBtnText');
    const spinner = document.getElementById('loginSpinner');
    if (errorMsg) {
        errorMsg.textContent = '';
        errorMsg.style.display = 'none';
    }
    if (btn) {
        btn.disabled = true;
    }
    if (btnText) btnText.style.opacity = '0.5';
    if (typeof spinnerSVG !== 'undefined' && spinner) spinner.innerHTML = spinnerSVG;
    if (spinner) spinner.style.display = '';
    if (!username || !password) {
        if (errorMsg) {
            errorMsg.textContent = 'Vui lòng nhập đầy đủ thông tin';
            errorMsg.style.display = '';
        }
        if (btn) btn.disabled = false;
        if (btnText) btnText.style.opacity = '1';
        if (spinner) {
            spinner.style.display = 'none';
            spinner.innerHTML = '';
        }
        return;
    }
    if (!fs) {
        if (errorMsg) {
            errorMsg.textContent = 'Firestore không khả dụng';
            errorMsg.style.display = '';
        }
        if (btn) btn.disabled = false;
        if (btnText) btnText.style.opacity = '1';
        if (spinner) {
            spinner.style.display = 'none';
            spinner.innerHTML = '';
        }
        return;
    }
    fs.collection('users').where('username', '==', username).limit(1).get().then(query => {
        if (!query.empty) {
            const doc = query.docs[0];
            const data = doc.data();
            if (data.password === password) {
                if (window.history && window.history.replaceState) window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
                const role = data.role || '';
                if (role === 'admin') {
                    page('/admin');
                } else if (role === 'gate') {
                    if (username == 'cong') {
                        printerId = 75749342; // id test
                    } else if (username == 'cong2') {
                        printerId = 75963782; // id test
                    }

                    page('/gate');
                    try {
                        if (typeof trySetCurrentDateAndRunDailyUpdate === 'function') trySetCurrentDateAndRunDailyUpdate().catch(console.error);
                    } catch (e) {
                        console.error('Trigger daily update on login failed', e);
                    }
                } else if (role === 'desk') {
                    sessionStorage.setItem('deskId', data.id || doc.id);
                    page('/desk');
                }
            } else {
                if (errorMsg) {
                    errorMsg.textContent = 'Đăng nhập thất bại';
                    errorMsg.style.display = '';
                }
            }
        } else {
            if (errorMsg) {
                errorMsg.textContent = 'Tài khoản không tồn tại';
                errorMsg.style.display = '';
            }
        }
    }).catch(err => {
        console.error('Firestore login error', err);
        if (errorMsg) {
            errorMsg.textContent = 'Lỗi kết nối máy chủ.';
            errorMsg.style.display = '';
        }
    }).finally(() => {
        if (btn) btn.disabled = false;
        if (btnText) btnText.style.opacity = '1';
        if (spinner) {
            spinner.style.display = 'none';
            spinner.innerHTML = '';
        }
    });
}

// -----------------------------
// Gate screen helpers
// -----------------------------
function loadProcedureList() {
    const container = document.getElementById('gateContainer');
    if (!container) return;
    container.innerHTML = '';
    if (typeof orangeSpinnerSVG !== 'undefined') {
        const overlay = document.createElement('div');
        overlay.id = 'procedureLoadingOverlay';
        overlay.style.position = 'fixed';
        overlay.style.top = 0;
        overlay.style.left = 0;
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = 'rgba(255,255,255,0.6)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = 1000;
        overlay.innerHTML = orangeSpinnerSVG;
        document.body.appendChild(overlay);
    }
    if (!fs) {
        container.innerHTML = '<div style="text-align:center;padding:24px 0;color:red;">Firestore không khả dụng</div>';
        return;
    }
    fs.collection('procedures').orderBy('name').get().then(snapshot => {
        const overlay = document.getElementById('procedureLoadingOverlay');
        if (overlay) overlay.remove();
        if (!snapshot.empty) {
            const deskList = snapshot.docs.map(doc => {
                const d = doc.data() || {};
                return {
                    name: d.name || d.title || doc.id,
                    id: d.id || doc.id
                };
            });
            deskList.forEach(item => {
                const div = document.createElement('div');
                div.className = 'desk-block';
                div.textContent = item.name;
                div.onclick = function() {
                    initDeskFunction(this, item.id, item.name);
                };
                container.appendChild(div);
            });
        } else {
            container.innerHTML = '<div style="text-align: center; padding: 24px 0;">Không có thủ tục</div>';
        }
    }).catch(err => {
        container.innerHTML = '<div style="color: red; text-align: center; padding: 24px 0;">Không tải được danh sách thủ tục</div>';
    });
}

function checkFirstLoginGateToday() {
    const key = 'lastLoginGate';
    const today = new Date().toISOString().slice(0, 10);
    const last = localStorage.getItem(key);
    if (last !== today) {
        localStorage.setItem(key, today);
        resetNode('/callQueue');
        resetNode('/counter');
    }
}

// -----------------------------
// Desk screen helpers (queue, current processing, audio)
// -----------------------------
function showDeskSpinner() {
    let overlay = document.getElementById('deskLoadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'deskLoadingOverlay';
        overlay.style.position = 'fixed';
        overlay.style.top = 0;
        overlay.style.left = 0;
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = 'rgba(255,255,255,0.6)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = 1000;
        overlay.innerHTML = (typeof orangeSpinnerSVG !== 'undefined' ? orangeSpinnerSVG : (typeof spinnerSVG !== 'undefined' ? spinnerSVG : 'Loading...'));
        document.body.appendChild(overlay);
    } else {
        overlay.style.display = 'flex';
    }
}

function hideDeskSpinner() {
    const overlay = document.getElementById('deskLoadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

function loadDeskQueue(type) {
    const deskId = sessionStorage.getItem('deskId');
    if (!deskId) {
        hideDeskSpinner();
        return;
    }
    const oldQueue = Array.isArray(queue) ? queue.map(item => item.number) : [];
    getScheduleById(deskId).then(data => {
        let newQueueArr = [];
        if (data && data.success) {
            if (typeof data.queue === 'string') {
                newQueueArr = data.queue.split(',').filter(x => x);
            } else if (Array.isArray(data.queue)) {
                newQueueArr = data.queue.map(x => String(x));
            }
            queue = newQueueArr.map(num => ({ number: num, name: '' }));
        } else {
            queue = [];
        }
        const added = newQueueArr.filter(num => !oldQueue.includes(num));
        if (added.length > 0 && type == 1) {
            showNewTicketNotification(added);
        }
        renderQueue();
        hideDeskSpinner();
    }).catch(() => {
        queue = [];
        renderQueue();
        hideDeskSpinner();
    });
}

function initDeskFunction(div, id, name) {
    document.querySelectorAll('.desk-block').forEach(e => e.classList.remove('active'));
    div.classList.add('active');
    showModalConfirm(name, id);
}

function showModalConfirm(name, id) {
    const modal = document.getElementById('modalConfirm');
    const modalFieldName = document.getElementById('modalFieldName');
    const btnConfirm = document.getElementById('btnConfirm');
    const btnCancel = document.getElementById('btnCancel');
    if (!modal) return;
    modalFieldName.textContent = name;
    modal.style.display = '';
    let spinnerEl = btnConfirm.querySelector('.spinner-inline');
    if (spinnerEl) spinnerEl.remove();
    btnConfirm.disabled = false;
    btnConfirm.innerHTML = 'Xác nhận';
    btnConfirm.onclick = function() {
        btnConfirm.disabled = true;
        if (typeof spinnerSVG !== 'undefined') {
            btnConfirm.innerHTML = `<span class="spinner-inline" style="vertical-align: middle; display: inline-block; width: 1.2em; height: 1.2em;">${spinnerSVG}</span> Đang xử lý...`;
        } else {
            btnConfirm.innerHTML = 'Đang xử lý...';
        }
        if (!fs) {
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = 'Xác nhận';
            modal.style.display = 'none';
            showResultModal(null);
            return;
        }
        fs.collection('schedules').doc(id).get().then(doc => {
            if (doc.exists) return doc;
            return fs.collection('schedules').where('id', '==', id).limit(1).get().then(q => {
                return q.empty ? null : q.docs[0];
            });
        }).then(foundDoc => {
            if (!foundDoc) throw new Error('Schedule not found');
            const schedRefResolved = fs.collection('schedules').doc(foundDoc.id);
            return fs.runTransaction(tx => {
                return tx.get(schedRefResolved).then(docSnap => {
                    if (!docSnap.exists) throw new Error('Schedule not found in transaction');
                    const data = docSnap.data() || {};
                    const currentVal = parseInt(data.counter, 10) || 0;
                    const newValue = currentVal + 1;
                    let queueArr = [];
                    if (Array.isArray(data.queue)) queueArr = data.queue.slice();
                    else if (typeof data.queue === 'string' && data.queue.length) queueArr = data.queue.split(',').filter(x => x);
                    queueArr.push(String(currentVal));
                    tx.update(schedRefResolved, {
                        counter: newValue,
                        queue: queueArr
                    });
                    return currentVal;
                });
            });
        }).then(prevCounter => {
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = 'Xác nhận';
            modal.style.display = 'none';
            showResultModal(prevCounter);
        }).catch(err => {
            console.error('Firestore updateCounter error', err);
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = 'Xác nhận';
            modal.style.display = 'none';
            showResultModal(null);
        });
    };
    btnCancel.onclick = function() {
        modal.style.display = 'none';
    };
}

function initSpinner() {
    const btnOk = document.getElementById('modalOk');
    if (!btnOk) return;
    btnOk.disabled = true;
    if (typeof spinnerSVG !== 'undefined') btnOk.innerHTML = `<span class="spinner-inline">${spinnerSVG}</span> Đang xử lý...`;
    else btnOk.innerHTML = 'Đang xử lý...';
}

function showModal(action, item, onOk) {
    const modal = document.getElementById('modalConfirm');
    const msg = document.getElementById('modalMsg');
    if (!modal || !msg) return;
    msg.textContent = `Xác nhận ${action.toLowerCase()} cho số ${item.number} ?`;
    modal.style.display = 'flex';
    const btnOk = document.getElementById('modalOk');
    const btnCancel = document.getElementById('modalCancel');
    btnOk.disabled = false;
    btnOk.innerHTML = 'Xác nhận';
    btnOk.onclick = () => onOk();
    btnCancel.onclick = () => {
        modal.style.display = 'none';
    };
}

function showResultModal(counter) {
    let modal = document.getElementById('modalResult');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalResult';
        modal.className = 'modal-overlay';
        modal.innerHTML = `<div class="modal-box"><div id="modalResultMsg" class="modal-title"></div><div class="modal-actions"><button id="btnPrint" class="modal-btn confirm" style="display:none;">In phiếu</button><button id="btnCloseResult" class="modal-btn cancel">Đóng</button></div></div>`;
        document.body.appendChild(modal);
    }
    const msg = modal.querySelector('#modalResultMsg');
    const btnPrint = modal.querySelector('#btnPrint');
    const btnClose = modal.querySelector('#btnCloseResult');
    if (counter) {
        db.ref('counter').set(counter);
        msg.innerHTML = `Bạn đã lấy số thành công!<br><span style='font-size:2rem;color:#000;font-weight:700;'>${counter}</span>`;
        btnPrint.style.display = '';
        btnPrint.onclick = function() {
            btnPrint.disabled = true;
            const oldHtml = btnPrint.innerHTML;
            if (typeof spinnerSVG !== 'undefined') btnPrint.innerHTML = `<span class="spinner-inline">${spinnerSVG}</span> Đang in...`;
            else btnPrint.innerHTML = 'Đang in...';
            printTicket(counter).finally(() => {
                btnPrint.disabled = false;
                btnPrint.innerHTML = oldHtml;
                modal.style.display = 'none';
            });
        };
    } else {
        msg.innerHTML = `<span style='color:red;'>Lấy số thất bại. Vui lòng thử lại!</span>`;
        btnPrint.style.display = 'none';
    }
    btnClose.onclick = () => {
        modal.style.display = 'none';
    };
    modal.style.display = 'flex';
}

function renderQueue() {
    const queueList = document.getElementById('queueList');
    if (!queueList) return;
    queueList.innerHTML = '';
    queue.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'queue-item';
        div.innerHTML = `<span class="ticket-number">${item.number}</span><span class="ticket-name"></span><button class="btn-call">Gọi số</button><button class="btn-skip">Bỏ qua</button>`;
        div.querySelector('.btn-call').onclick = () => {
            showModal('Gọi số', item, () => {
                initSpinner();
                const deskId = sessionStorage.getItem('deskId');
                const apiCall = firestoreCallCounterById(deskId, item.number);
                apiCall.then(data => {
                    if (data && data.success && data.text) {
                        const modal = document.getElementById('modalConfirm');
                        if (modal) modal.style.display = 'none';
                        db.ref('callQueue').push({
                            counter: data.text,
                            deskId: deskId.replace('desk', ''),
                            timestamp: Date.now(),
                            played: false
                        });
                        callTicket(idx, false);
                    }
                });
            });
        };
        div.querySelector('.btn-skip').onclick = () => {
            showModal('Bỏ qua', item, () => {
                initSpinner();
                const deskId = sessionStorage.getItem('deskId');
                const apiCall = firestoreUpdateProcessing(deskId, item.number, 0);
                apiCall.then(() => {
                    queue.splice(idx, 1);
                    renderQueue();
                    const modal = document.getElementById('modalConfirm');
                    if (modal) modal.style.display = 'none';
                });
            });
        };
        queueList.appendChild(div);
    });
}

function renderCurrent() {
    const num = document.getElementById('currentTicketNumber');
    const name = document.getElementById('currentTicketName');
    const btn = document.getElementById('btnComplete');
    const btnRecall = document.getElementById('btnRecall');
    const btnReskip = document.getElementById('btnReskip');
    if (current) {
        if (num) num.textContent = current.number;
        if (name) name.textContent = current.name;
        if (btn) btn.style.display = '';
        if (btnRecall) btnRecall.style.display = '';
        if (btnReskip) btnReskip.style.display = '';
        if (btnRecall) btnRecall.onclick = () => {
            btnRecall.disabled = true;
            const oldHtml = btnRecall.innerHTML;
            btnRecall.innerHTML = `<span class="spinner-inline">${typeof spinnerSVG!=='undefined'?spinnerSVG:'🔄'}</span> Đang gọi...`;
            const deskId = sessionStorage.getItem('deskId');
            const apiCall = firestoreCallCounterById(deskId, current.number);
            apiCall.then(data => {
                if (data && data.success && data.text) {
                    audioQueue.push({
                        counter: data.text,
                        deskId: deskId.replace('desk', '')
                    });
                    playNextAudioInQueue();
                }
            }).finally(() => {
                setTimeout(() => {
                    btnRecall.disabled = false;
                    btnRecall.innerHTML = oldHtml;
                }, 1000);
            });
        };
        if (btnReskip) btnReskip.onclick = () => {
            showModal('Bỏ qua', current, () => {
                initSpinner();
                const deskId = sessionStorage.getItem('deskId');
                const apiCall = firestoreUpdateProcessing(deskId, current.number, 0);
                apiCall.then(() => {
                    current = null;
                    renderCurrent();
                    loadDeskQueue(1);
                    const modal = document.getElementById('modalConfirm');
                    if (modal) modal.style.display = 'none';
                });
            });
        };
        if (btn) btn.onclick = () => {
            showModal('Hoàn thành', current, () => {
                initSpinner();
                const deskId = sessionStorage.getItem('deskId');
                const apiCall = firestoreUpdateProcessing(deskId, current.number, 1);
                apiCall.then(() => {
                    current = null;
                    renderCurrent();
                    loadDeskQueue(1);
                    const modal = document.getElementById('modalConfirm');
                    if (modal) modal.style.display = 'none';
                });
            });
        };
    } else {
        if (num) num.textContent = '--';
        if (name) name.textContent = 'Chưa có hồ sơ';
        if (btn) btn.style.display = 'none';
        if (btnRecall) btnRecall.style.display = 'none';
        if (btnReskip) btnReskip.style.display = 'none';
    }
}

function callTicket(idx, removeFromQueue = false) {
    current = queue[idx];
    if (removeFromQueue) queue.splice(idx, 1);
    renderQueue();
    renderCurrent();
}

function skipTicket(idx) {
    queue.splice(idx, 1);
    renderQueue();
}

function completeTicket() {
    current = null;
    renderCurrent();
}

// -----------------------------
// Audio helpers (call announcements)
// -----------------------------
function playQueueAudio(textArr, deskId) {
    function playMp3(url) {
        return new Promise(resolve => {
            if (!url) return resolve();
            const audio = new Audio(url);
            audio.playbackRate = 1;
            audio.onended = resolve;
            audio.onerror = resolve;
            audio.currentTime = 0;
            if (audio.readyState >= 1) audio.play();
            else audio.onloadedmetadata = () => {
                audio.currentTime = 0;
                audio.play();
            };
        });
    }
    const files = [];
    if (typeof mp3BeforeUrl !== 'undefined') files.push(mp3BeforeUrl);
    if (Array.isArray(textArr)) {
        textArr.forEach(num => {
            if (num == '0') files.push(mp30);
            if (num == '1') files.push(mp31);
            if (num == '2') files.push(mp32);
            if (num == '3') files.push(mp33);
            if (num == '4') files.push(mp34);
            if (num == '5') files.push(mp35);
            if (num == '6') files.push(mp36);
            if (num == '7') files.push(mp37);
            if (num == '8') files.push(mp38);
            if (num == '9') files.push(mp39);
        });
    }
    if (typeof mp3AfterUrl !== 'undefined') files.push(mp3AfterUrl);
    if (deskId == '0') files.push(mp30);
    if (deskId == '1') files.push(mp31);
    if (deskId == '2') files.push(mp32);
    if (deskId == '3') files.push(mp33);
    if (deskId == '4') files.push(mp34);
    if (deskId == '5') files.push(mp35);
    if (deskId == '6') files.push(mp36);
    if (deskId == '7') files.push(mp37);
    if (deskId == '8') files.push(mp38);
    if (deskId == '9') files.push(mp39);
    if (typeof mp3EndUrl !== 'undefined') files.push(mp3EndUrl);
    let p = Promise.resolve();
    files.forEach(url => {
        p = p.then(() => playMp3(url));
    });
    return p;
}

let audioQueue = [];
let isPlayingAudio = false;

function listenCallQueueAndPlay() {
    if (typeof db === 'undefined' || !db.ref) return;
    db.ref('callQueue').on('child_added', function(snapshot) {
        const callData = snapshot.val();
        if (!callData.played) {
            snapshot.ref.update({
                played: true
            });
            audioQueue.push({
                counter: callData.counter,
                deskId: callData.deskId
            });
            playNextAudioInQueue();
            try {
                // If this client is a desk and the call is for this desk, refresh its queue
                const localDeskIdRaw = sessionStorage.getItem('deskId') || '';
                const localDeskId = localDeskIdRaw.replace(/^desk/, '');
                const callDeskId = String(callData.deskId || '');
                if (localDeskId && callDeskId && localDeskId === callDeskId) {
                    if (typeof loadDeskQueue === 'function') loadDeskQueue(1);
                } else if (document.getElementById('queueList')) {
                    // If we're on a page that has a queueList, refresh anyway
                    if (typeof loadDeskQueue === 'function') loadDeskQueue(1);
                }
            } catch (e) {}
        }
    });
}

function playNextAudioInQueue() {
    if (isPlayingAudio || audioQueue.length === 0) return;
    isPlayingAudio = true;
    const item = audioQueue.shift();
    const textArr = item.counter.toString().split('');
    playQueueAudio(textArr, item.deskId).then(() => {
        setTimeout(() => {
            isPlayingAudio = false;
            playNextAudioInQueue();
        }, 2000);
    });
}

function showNewTicketNotification(numbers) {
    if (!Array.isArray(numbers) || numbers.length === 0) return;
    const msg = 'Có số mới: ' + numbers.join(', ');
    let notif = document.getElementById('newTicketNotif');
    if (!notif) {
        notif = document.createElement('div');
        notif.id = 'newTicketNotif';
        notif.style.position = 'fixed';
        notif.style.top = '30px';
        notif.style.right = '30px';
        notif.style.background = 'rgba(77,206,94,0.95)';
        notif.style.color = '#fff';
        notif.style.padding = '16px 28px';
        notif.style.borderRadius = '8px';
        notif.style.fontSize = '1.3rem';
        notif.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        notif.style.zIndex = 9999;
        document.body.appendChild(notif);
    }
    notif.textContent = msg;
    notif.style.display = 'block';
    if (typeof mp3AlertUrl !== 'undefined' && mp3AlertUrl) try {
        new Audio(mp3AlertUrl).play();
    } catch (e) {}
    setTimeout(() => {
        notif.style.display = 'none';
    }, 3500);
}

// -----------------------------
// Admin initializer (schedules + history)
// -----------------------------
function initAdminPage() {
    function el(tag, text) {
        const e = document.createElement(tag);
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function clear(tbody) {
        while (tbody && tbody.firstChild) tbody.removeChild(tbody.firstChild);
    }
    async function loadSchedules() {
        const tbody = document.querySelector('#schedulesTable tbody');
        if (!tbody) return;
        clear(tbody);
        if (!fs) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 7;
            td.textContent = 'Firestore không khả dụng';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }
        try {
            const snap = await fs.collection('schedules').orderBy('id').get();
            if (snap.empty) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 7;
                td.textContent = 'No schedules';
                tr.appendChild(td);
                tbody.appendChild(tr);
                return;
            }
            snap.forEach(doc => {
                const d = doc.data() || {};
                const tr = document.createElement('tr');
                tr.appendChild(el('td', d.id || doc.id || ''));
                tr.appendChild(el('td', d.name || ''));
                tr.appendChild(el('td', String(d.counter || '')));
                tr.appendChild(el('td', String(d.processing || '')));
                tr.appendChild(el('td', String(d.done || 0)));
                tr.appendChild(el('td', String(d.skip || 0)));
                tr.appendChild(el('td', d.status || ''));
                tbody.appendChild(tr);
            });
        } catch (e) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 7;
            td.textContent = 'Error loading schedules';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
    }
    async function loadHistoryFor(dateStr) {
        const tbody = document.querySelector('#historyTable tbody');
        if (!tbody) return;
        clear(tbody);
        if (!dateStr) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 5;
            td.textContent = 'Chọn ngày để lọc';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }
        if (!fs) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 5;
            td.textContent = 'Firestore không khả dụng';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }
        try {
            const snap = await fs.collection('history').where('date', '==', dateStr).get();
            if (snap.empty) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 5;
                td.textContent = 'No history for selected date';
                tr.appendChild(td);
                tbody.appendChild(tr);
                return;
            }
            const rows = [];
            snap.forEach(doc => {
                const d = doc.data() || {};
                rows.push({
                    date: d.date || '',
                    id: d.id || '',
                    name: d.name || '',
                    done: parseInt(d.done, 10) || 0,
                    skip: parseInt(d.skip, 10) || 0,
                    createdAt: d.createdAt ? (d.createdAt.seconds ? d.createdAt.seconds * 1000 : new Date(d.createdAt).getTime()) : 0
                });
            });
            rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            rows.forEach(d => {
                const tr = document.createElement('tr');
                tr.appendChild(el('td', d.date));
                tr.appendChild(el('td', d.id));
                tr.appendChild(el('td', d.name));
                tr.appendChild(el('td', String(d.done)));
                tr.appendChild(el('td', String(d.skip)));
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error('loadHistoryFor error', e);
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 5;
            td.textContent = 'Error loading history: ' + (e && e.message ? e.message : String(e));
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
    }
    const btnReload = document.getElementById('reloadSchedules');
    const btnFilter = document.getElementById('loadHistory');
    if (btnReload) btnReload.onclick = () => loadSchedules();
    if (btnFilter) btnFilter.onclick = () => {
        const d = (document.getElementById('historyDate') || {}).value;
        loadHistoryFor(d);
    };
    const inputDate = document.getElementById('historyDate');
    if (inputDate && !inputDate.value) {
        const dt = new Date();
        dt.setDate(dt.getDate() - 1);
        inputDate.value = dt.toISOString().slice(0, 10);
    }
    setTimeout(() => {
        loadSchedules();
        const d = (document.getElementById('historyDate') || {}).value;
        if (d) loadHistoryFor(d);
    }, 200);
}

// -----------------------------
// Daily update coordination using Realtime Database
// -----------------------------
function todayStringVN() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const vn = new Date(utc + 7 * 3600000);
    return vn.toISOString().slice(0, 10);
}

function trySetCurrentDateAndRunDailyUpdate() {
    if (!db) {
        console.warn('Realtime Database not initialized, cannot coordinate daily update.');
        return Promise.resolve(false);
    }
    const today = todayStringVN();
    const metaRef = db.ref('meta/currentDate');
    return new Promise((resolve, reject) => {
        metaRef.once('value').then(snapshot => {
            const remoteVal = snapshot && snapshot.val && snapshot.val();
            if (remoteVal === today) return resolve(false);
            metaRef.transaction(function(existing) {
                if (existing === today) return;
                return today;
            }, async function(error, committed, snapshotTx) {
                if (error) {
                    console.error('[tryDailyUpdate] RTDB transaction error', error);
                    return reject(error);
                }
                if (!committed) return resolve(false);
                try {
                    await runDailyUpdate();
                    try {
                        const by = (firebase && firebase.auth && firebase.auth().currentUser) ? (firebase.auth().currentUser.uid || 'kiosk') : 'kiosk';
                        db.ref('meta/lastDailyUpdate').set({
                            by: by,
                            ts: firebase.database.ServerValue.TIMESTAMP
                        });
                    } catch (e) {
                        console.warn('[tryDailyUpdate] failed to write lastDailyUpdate', e);
                    }
                    return resolve(true);
                } catch (e) {
                    console.error('[tryDailyUpdate] dailyUpdate failed', e);
                    return resolve(false);
                }
            }, false);
        }).catch(err => {
            console.error('[tryDailyUpdate] failed to read meta/currentDate', err);
            metaRef.transaction(function(existing) {
                if (existing === today) return;
                return today;
            }, function(error, committed, snapshotTx) {
                if (error) {
                    console.error('[tryDailyUpdate] RTDB transaction error (fallback)', error);
                    return reject(error);
                }
                if (!committed) return resolve(false);
                runDailyUpdate().then(() => resolve(true)).catch(e => {
                    console.error('[tryDailyUpdate] dailyUpdate failed (fallback)', e);
                    resolve(false);
                });
            }, false);
        });
    });
}

async function runDailyUpdate() {
    if (!fs) {
        console.warn('Firestore not available — dailyUpdate skipped.');
        return;
    }
    try {
        const collectionName = window.DAILY_UPDATE_COLLECTION || 'schedules';
        const snapshot = await fs.collection(collectionName).get();
        if (snapshot.empty) return 0;
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const vn = new Date(utc + 7 * 3600000);
        const prev = new Date(vn);
        prev.setDate(vn.getDate() - 1);
        const prevDateStr = prev.toISOString().slice(0, 10);
        const historyColl = fs.collection('history');
        let batch = fs.batch();
        const commits = [];
        let ops = 0;
        snapshot.forEach(doc => {
            const data = doc.data() || {};
            const hist = {
                id: (data.id !== undefined && data.id !== null) ? data.id : doc.id,
                name: data.name || '',
                done: parseInt(data.done, 10) || 0,
                skip: parseInt(data.skip, 10) || 0,
                date: prevDateStr,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            batch.set(historyColl.doc(), hist);
            const newCounter = (data.startCounter !== undefined && data.startCounter !== null) ? data.startCounter : (data.counter !== undefined && data.counter !== null ? data.counter : 0);
            const newProcessing = (newCounter !== undefined && newCounter !== null) ? String(newCounter) : '';
            batch.update(doc.ref, {
                counter: newCounter,
                status: 'waiting',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                done: 0,
                skip: 0,
                queue: [],
                processing: newProcessing
            });
            ops++;
            if (ops % 500 === 0) {
                commits.push(batch.commit());
                batch = fs.batch();
            }
        });
        commits.push(batch.commit());
        await Promise.all(commits);
        return ops;
    } catch (err) {
        console.error('runDailyUpdate error', err);
        throw err;
    }
}

// Expose daily update helpers
window.tryDailyUpdateOnLogin = trySetCurrentDateAndRunDailyUpdate;
window.runDailyUpdateNow = async function() {
    try {
        return await runDailyUpdate();
    } catch (e) {
        console.error('runDailyUpdateNow error', e);
        throw e;
    }
};

// Diagnostics
window.findNeedsUpdateDocs = async function(limit = 200) {
    if (!fs) {
        console.warn('Firestore not available');
        return [];
    }
    const collectionName = window.DAILY_UPDATE_COLLECTION || 'schedules';
    const snapshot = await fs.collection(collectionName).limit(limit).get();
    const results = [];
    snapshot.forEach(doc => {
        const data = doc.data() || {};
        results.push({
            id: doc.id,
            needsUpdate: data.hasOwnProperty('needsUpdate') ? data.needsUpdate : undefined
        });
    });
    return results;
};

window.normalizeNeedsUpdateAndRun = async function(limit = 500) {
    if (!fs) {
        console.warn('Firestore not available');
        return 0;
    }
    const collectionName = window.DAILY_UPDATE_COLLECTION || 'schedules';
    const snapshot = await fs.collection(collectionName).limit(limit).get();
    const batch = fs.batch();
    let changed = 0;
    snapshot.forEach(doc => {
        const data = doc.data() || {};
        if (!data.hasOwnProperty('needsUpdate')) return;
        const v = data.needsUpdate;
        const shouldBeTrue = (v === true) || (v === 'true') || (v === '1') || (v === 1) || (v === 'yes');
        if (shouldBeTrue && v !== true) {
            batch.update(doc.ref, {
                needsUpdate: true
            });
            changed++;
        }
    });
    if (changed > 0) await batch.commit();
    const res = await runDailyUpdate();
    return {
        normalized: changed,
        updated: res
    };
};

// -----------------------------
// Misc helpers
// -----------------------------
function resetNode(path) {
    db.ref(path).remove();
}

// -----------------------------
// Exports for legacy code expectations
// -----------------------------
// (Some callers expect these globals/functions to exist)
window.initAdminPage = window.initAdminPage || initAdminPage;