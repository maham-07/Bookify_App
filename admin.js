const API_URL = 'http://localhost:3000';

let isEditingMode = false;

function parseDealDate(dateValue, endOfDay = false) {
    if (!dateValue) return null;
    const parsed = new Date(`${dateValue}T${endOfDay ? '23:59:59' : '00:00:00'}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isDealExpired(deal) {
    const endDate = parseDealDate(deal.toDate, true);
    if (!endDate) return true;
    return endDate < new Date();
}

async function markExpiredDealsInactive() {
    try {
        const res = await fetch(`${API_URL}/deals`);
        if (!res.ok) return;
        const deals = await res.json();
        const expiredDeals = deals.filter((deal) => deal.id && deal.isActive !== false && isDealExpired(deal));
        await Promise.allSettled(expiredDeals.map((deal) => (
            fetch(`${API_URL}/deals/${deal.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: false })
            })
        )));
    } catch (e) { console.error(e); }
}

document.addEventListener('DOMContentLoaded', () => {
    initAdminAuth();
    initAdminNavigation();
    initBookFormSubmit();
    initDealSubmit();
    restoreAdminSession();
});

// Admin System Secure Router Handlers
function initAdminAuth() {
    const loginForm = document.getElementById('adminLoginForm');
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('admEmail').value.trim().toLowerCase();
        const pass = document.getElementById('admPass').value;
        
        // Secured Hardcoded administrative account profile matching configurations
        if (email === 'admin@bookify.com' && pass === 'securepass123') {
            setAdminLoggedInState(true);
        } else {
            const err = document.getElementById('admError');
            err.classList.remove('hidden');
        }
    });
}

function initAdminNavigation() {
    const routeMap = {
        'toStats': 'adminStatsView',
        'toInventory': 'adminInventoryView',
        'toOrders': 'adminOrdersView',
        'toRequests': 'adminRequestsView'
    };

    Object.keys(routeMap).forEach(btnId => {
        document.getElementById(btnId).addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.admin-view').forEach(v => v.classList.add('hidden'));
            document.getElementById(routeMap[btnId]).classList.remove('hidden');
            
            document.querySelectorAll('#adminNavLinks a').forEach(a => a.classList.remove('active'));
            e.target.classList.add('active');
            
            // Dynamic refresh loads on change
            if (btnId === 'toStats') loadStatsOverview();
            if (btnId === 'toInventory') loadInventoryTable();
            if (btnId === 'toOrders') loadOrdersTable();
            if (btnId === 'toRequests') loadRequestsTable();
        });
    });

    document.getElementById('adminLogout').addEventListener('click', (e) => {
        e.preventDefault();
        setAdminLoggedInState(false);
    });
}

function setAdminLoggedInState(isLoggedIn) {
    if (isLoggedIn) {
        document.getElementById('adminLoginSection').classList.add('hidden');
        document.getElementById('adminMainDashboardView').classList.remove('hidden');
        document.getElementById('adminNavLinks').style.display = 'inline-block';
        document.getElementById('admError').classList.add('hidden');
        localStorage.setItem('bookifyAdminLoggedIn', 'true');
        loadStatsOverview();
        return;
    }

    localStorage.removeItem('bookifyAdminLoggedIn');
    document.getElementById('adminNavLinks').style.display = 'none';
    document.getElementById('adminMainDashboardView').classList.add('hidden');
    document.getElementById('adminLoginSection').classList.remove('hidden');
    document.getElementById('adminLoginForm').reset();
    document.getElementById('admError').classList.add('hidden');
}

function restoreAdminSession() {
    if (localStorage.getItem('bookifyAdminLoggedIn') === 'true') {
        setAdminLoggedInState(true);
    }
}

// Analytics and Metrics Dashboard Calculation Engine
async function loadStatsOverview() {
    try {
        await markExpiredDealsInactive();
        const [resB, resO, resR] = await Promise.all([
            fetch(`${API_URL}/books`),
            fetch(`${API_URL}/orders`),
            fetch(`${API_URL}/requests`)
        ]);
        
        if(resB.ok && resO.ok && resR.ok) {
            const b = await resB.json();
            const o = await resO.json();
            const r = await resR.json();
            
            document.getElementById('statBooks').textContent = b.length;
            document.getElementById('statOrders').textContent = o.length;
            document.getElementById('statRequests').textContent = r.filter(i => i.status === 'Pending').length;
        }
    } catch(e) { console.error(e); }
}

// Book Inventory CRUD Operations Engine
async function loadInventoryTable() {
    try {
        const res = await fetch(`${API_URL}/books`);
        if(!res.ok) throw new Error('Data processing failure');
        const books = await res.json();
        
        const tbody = document.getElementById('inventoryTableBody');
        tbody.innerHTML = '';
        
        books.forEach(book => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><img src="${book.image}" class="table-mini-img" onerror="this.src='https://images.unsplash.com/photo-1543002588-bfa74002ed7e?q=80&w=50'"></td>
                <td><strong>${book.title}</strong></td>
                <td>${book.author}</td>
                <td>${book.stock} units</td>
                <td>$${book.price.toFixed(2)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="prepareEditBook('${book.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBookItem('${book.id}')">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

function initBookFormSubmit() {
    const form = document.getElementById('bookForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            id: document.getElementById('bookUID').value.trim(),
            title: document.getElementById('bookTitle').value.trim(),
            author: document.getElementById('bookAuthor').value.trim(),
            price: parseFloat(document.getElementById('bookPrice').value),
            stock: parseInt(document.getElementById('bookStock').value, 10),
            category: document.getElementById('bookCategory').value,
            image: document.getElementById('bookImgPath').value.trim(),
            rating: 5
        };

        try {
            let url = `${API_URL}/books`;
            let method = 'POST';
            
            if (isEditingMode) {
                const targetId = document.getElementById('editBookId').value;
                url = `${API_URL}/books/${targetId}`;
                method = 'PUT'; // Complete object mutation overrides
            }

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                form.reset();
                resetFormState();
                loadInventoryTable();
            }
        } catch (err) { console.error(err); }
    });

    document.getElementById('cancelEditBtn').addEventListener('click', resetFormState);
}

window.prepareEditBook = async function(id) {
    try {
        const res = await fetch(`${API_URL}/books/${id}`);
        if(res.ok) {
            const b = await res.json();
            document.getElementById('editBookId').value = b.id;
            document.getElementById('bookUID').value = b.id;
            document.getElementById('bookUID').disabled = true; // Block mutations to unique asset identifier strings
            document.getElementById('bookTitle').value = b.title;
            document.getElementById('bookAuthor').value = b.author;
            document.getElementById('bookPrice').value = b.price;
            document.getElementById('bookStock').value = b.stock;
            document.getElementById('bookCategory').value = b.category;
            document.getElementById('bookImgPath').value = b.image;
            
            document.getElementById('formActionTitle').textContent = "Modify Asset Parameters";
            document.getElementById('saveFormBtn').textContent = "Apply Code Parameters";
            document.getElementById('cancelEditBtn').classList.remove('hidden');
            isEditingMode = true;
        }
    } catch(e) { console.error(e); }
};

window.deleteBookItem = async function(id) {
    if (confirm("Confirm database asset deletion? The item will be permanently removed.")) {
        try {
            const res = await fetch(`${API_URL}/books/${id}`, { method: 'DELETE' });
            if (res.ok) loadInventoryTable();
        } catch (e) { console.error(e); }
    }
};

function resetFormState() {
    document.getElementById('bookForm').reset();
    document.getElementById('bookUID').disabled = false;
    document.getElementById('formActionTitle').textContent = "Add New System Book";
    document.getElementById('saveFormBtn').textContent = "Commit to Inventory Database";
    document.getElementById('cancelEditBtn').classList.add('hidden');
    isEditingMode = false;
}

// User System Order Management Logic Engine
async function loadOrdersTable() {
    try {
        const res = await fetch(`${API_URL}/orders`);
        if (res.ok) {
            const orders = await res.json();
            const tbody = document.getElementById('ordersTableBody');
            tbody.innerHTML = '';
            
            orders.forEach(o => {
                const itemsSum = o.items.map(i => `${i.title} (${i.qty})`).join(', ');
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${o.customerName}</strong><br><small>${o.customerEmail}</small></td>
                    <td>${o.address}, ${o.city} (${o.postalCode})</td>
                    <td><span class="truncated-text">${itemsSum}</span></td>
                    <td><strong>$${o.totalCost.toFixed(2)}</strong></td>
                    <td><span class="status-pill status-${o.status.toLowerCase()}">${o.status}</span></td>
                    <td>
                        ${o.status === 'Pending' ? `<button class="btn btn-sm btn-success" onclick="confirmUserOrder('${o.id}')">Confirm Delivery</button>` : '✔️ Cleared'}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (e) { console.error(e); }
}

window.confirmUserOrder = async function(id) {
    try {
        const res = await fetch(`${API_URL}/orders/${id}`, {
            method: 'PATCH', // Target updates modifying state property contexts only
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Confirmed' })
        });
        if (res.ok) loadOrdersTable();
    } catch(e) { console.error(e); }
};

// Help Requests & Customer Complaints Tracking Center Operations
function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function buildRequestInfoHtml(request) {
    if (request.type === 'Wrong Book') {
        const wrongBook = request.wrongDeliveredBook || request.bookName || 'Not provided';
        const orderedBook = request.orderedBookName || 'Not provided';
        const orderNumber = request.orderNumber || 'Not provided';
        const author = request.authorName || 'Not provided';

        return `
            <strong>Wrong Delivered:</strong> <em>${escapeHtml(wrongBook)}</em><br>
            <strong>Ordered Book:</strong> <em>${escapeHtml(orderedBook)}</em><br>
            <strong>Author:</strong> ${escapeHtml(author)}<br>
            <strong>Order #:</strong> ${escapeHtml(orderNumber)}
        `;
    }

    if (request.type === 'Delivery Issue') {
        const bookName = request.bookName || 'Not provided';
        const orderNumber = request.orderNumber || 'Not provided';
        const reason = request.deliveryReason || 'Not provided';
        const issue = request.deliveryIssue || request.issueDescription || 'Not provided';
        const note = request.additionalNote ? `<br><strong>Extra Note:</strong> ${escapeHtml(request.additionalNote)}` : '';

        return `
            <strong>Book:</strong> <em>${escapeHtml(bookName)}</em><br>
            <strong>Order #:</strong> ${escapeHtml(orderNumber)}<br>
            <strong>Reason:</strong> ${escapeHtml(reason)}<br>
            <strong>Issue:</strong> ${escapeHtml(issue)}${note}
        `;
    }

    const bookName = request.bookName || 'Not provided';
    const author = request.authorName ? ` by ${escapeHtml(request.authorName)}` : '';
    return `Title Target: <em>${escapeHtml(bookName)}</em>${author}`;
}

async function loadRequestsTable() {
    try {
        const res = await fetch(`${API_URL}/requests`);
        if (res.ok) {
            const reqs = await res.json();
            const tbody = document.getElementById('requestsTableBody');
            tbody.innerHTML = '';
            
            reqs.forEach(r => {
                const status = r.status || 'Pending';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><small class="type-tag">${escapeHtml(r.type)}</small></td>
                    <td><strong>${escapeHtml(r.userName)}</strong><br>${escapeHtml(r.userEmail)}</td>
                    <td>${buildRequestInfoHtml(r)}</td>
                    <td><span class="status-pill status-${status.toLowerCase()}">${escapeHtml(status)}</span></td>
                    <td>
                        <select onchange="updateRequestState('${r.id}', this.value)">
                            <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>Pending</option>
                            <option value="Accepted" ${status === 'Accepted' ? 'selected' : ''}>Accept</option>
                            <option value="Confirmed" ${status === 'Confirmed' ? 'selected' : ''}>Confirm</option>
                            <option value="Deleted" ${status === 'Deleted' ? 'selected' : ''}>Delete/Drop</option>
                        </select>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch(e) { console.error(e); }
}

window.updateRequestState = async function(id, nextState) {
    try {
        if (nextState === 'Deleted') {
            if (confirm("Purge ticket entry data from records?")) {
                await fetch(`${API_URL}/requests/${id}`, { method: 'DELETE' });
            }
        } else {
            await fetch(`${API_URL}/requests/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: nextState })
            });
        }
        loadRequestsTable();
    } catch (e) { console.error(e); }
};

// Special Promotional Deals Publishing Module Operations
function initDealSubmit() {
    const form = document.getElementById('dealCreationForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dealName = document.getElementById('dealName').value.trim();
        const productName = document.getElementById('dealProductName').value.trim();
        const discountedPrice = parseFloat(document.getElementById('dealDiscountedPrice').value);
        const stock = parseInt(document.getElementById('dealStock').value, 10);
        const color = document.getElementById('dealColor').value.trim();
        const size = document.getElementById('dealSize').value.trim();
        const image = document.getElementById('dealImage').value.trim();
        const fromDate = document.getElementById('dealFromDate').value;
        const toDate = document.getElementById('dealToDate').value;

        if (!dealName || !productName || Number.isNaN(discountedPrice) || Number.isNaN(stock) || !color || !size || !image || !fromDate || !toDate) {
            alert('Please fill all deal fields.');
            return;
        }

        const startDate = parseDealDate(fromDate);
        const endDate = parseDealDate(toDate, true);
        if (!startDate || !endDate || startDate > endDate) {
            alert('From date cannot be after To date.');
            return;
        }

        if (endDate < new Date()) {
            alert('This deal has already expired. Please choose a future end date.');
            return;
        }

        const newDeal = { dealName, productName, discountedPrice, stock, color, size, image, fromDate, toDate, isActive: true };
        try {
            const res = await fetch(`${API_URL}/deals`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newDeal)
            });
            if (res.ok) {
                form.reset();
                alert("Special Deal deployed to the customer display front page! 🎉");
            }
        } catch (err) { console.error(err); }
    });
}
