const API_URL = 'http://localhost:3000';

let appBooks = [];
let shoppingCart = [];
let authenticatedUser = null;
let activeDeals = [];
let selectedDealForCheckout = null;

function setInlineMessage(elementId, message, type = 'error') {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.textContent = message;
    element.classList.remove('hidden', 'success-banner', 'error-banner');
    element.classList.add(type === 'success' ? 'success-banner' : 'error-banner');
}

function clearInlineMessage(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.textContent = '';
    element.classList.add('hidden');
}

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

function isDealInActiveRange(deal) {
    if (deal.isActive === false || isDealExpired(deal)) return false;
    const startDate = parseDealDate(deal.fromDate);
    if (!startDate) return false;
    return startDate <= new Date();
}

async function markExpiredDealsInactive(deals) {
    const expiredDeals = deals.filter((deal) => deal.id && deal.isActive !== false && isDealExpired(deal));
    await Promise.allSettled(expiredDeals.map((deal) => (
        fetch(`${API_URL}/deals/${deal.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: false })
        })
    )));
}

document.addEventListener('DOMContentLoaded', () => {
    initViewRouting();
    initAuthFlows();
    initCatalogHandlers();
    initCartCheckout();
    initRequestForm();
    initDealModal();
    fetchLoadDeals();
    restoreUserSession();
});

// --- NAVIGATION & VIEWS ---
function switchView(targetSectionId) {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(targetSectionId).classList.remove('hidden');
    document.querySelectorAll('.nav-links a').forEach(link => link.classList.remove('active'));
    
    // Highlight Active Tab
    const tabMap = {
        'landingSection': 'navHome',
        'browseSection': 'navBrowse',
        'cartSection': 'navCart',
        'requestsSection': 'navRequests'
    };
    if (tabMap[targetSectionId]) {
        document.getElementById(tabMap[targetSectionId]).classList.add('active');
    }
}

function initViewRouting() {
    document.getElementById('navHome').addEventListener('click', (e) => { e.preventDefault(); switchView('landingSection'); });
    document.getElementById('navBrowse').addEventListener('click', (e) => { e.preventDefault(); switchView('browseSection'); fetchLoadBooks(); });
    document.getElementById('navCart').addEventListener('click', (e) => { e.preventDefault(); switchView('cartSection'); renderCart(); });
    document.getElementById('navRequests').addEventListener('click', (e) => { e.preventDefault(); switchView('requestsSection'); });
    
    document.getElementById('showSignupBtn').addEventListener('click', () => { switchView('authSection'); toggleAuthBox('signup'); });
    document.getElementById('showLoginBtn').addEventListener('click', () => { switchView('authSection'); toggleAuthBox('login'); });
    
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        authenticatedUser = null;
        shoppingCart = [];
        localStorage.removeItem('bookifyUserSession');
        updateCartBadge();
        document.getElementById('navBrowse').style.display = 'inline-block';
        document.getElementById('navCart').style.display = 'none';
        document.getElementById('navRequests').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'none';
        switchView('landingSection');
    });
}

function toggleAuthBox(mode) {
    document.getElementById('loginFormGeneralError').classList.add('hidden');
    document.getElementById('signupFormGeneralError').classList.add('hidden');
    
    if (mode === 'login') {
        document.getElementById('loginBox').classList.remove('hidden');
        document.getElementById('signupBox').classList.add('hidden');
    } else {
        document.getElementById('signupBox').classList.remove('hidden');
        document.getElementById('loginBox').classList.add('hidden');
    }
}

// --- AUTHENTICATION (LOGIN & SIGNUP) ---
function initAuthFlows() {
    const signupForm = document.getElementById('signupForm');
    const loginForm = document.getElementById('loginForm');

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        if (!validateSignupForm()) return;
        document.getElementById('signupFormGeneralError').classList.add('hidden');

        const normalizedEmail = document.getElementById('signupEmail').value.trim().toLowerCase();
        const normalizedPassword = document.getElementById('signupPassword').value.trim();
        const newUser = {
            name: document.getElementById('signupName').value.trim(),
            email: normalizedEmail,
            password: normalizedPassword
        };

        try {
            // Check if user exists
            const checkRes = await fetch(`${API_URL}/users?email=${encodeURIComponent(newUser.email)}`);
            if (!checkRes.ok) throw new Error('Database error');
            const existing = await checkRes.json();
            
            if (existing.length > 0) {
                document.getElementById('signupEmailError').textContent = 'Email is already registered.';
                return;
            }

            // Create new user
            const res = await fetch(`${API_URL}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser)
            });

            if (res.ok) {
                authenticatedUser = await res.json();
                activateSession();
            }
        } catch (err) {
            document.getElementById('signupFormGeneralError').textContent = "⚠️ Cannot reach database. Run JSON Server!";
            document.getElementById('signupFormGeneralError').classList.remove('hidden');
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateLoginForm()) return;
        document.getElementById('loginFormGeneralError').classList.add('hidden');

        const email = document.getElementById('loginEmail').value.trim().toLowerCase();
        const pass = document.getElementById('loginPassword').value.trim();

        try {
            const res = await fetch(`${API_URL}/users?email=${encodeURIComponent(email)}`);
            if (!res.ok) throw new Error('Database error');
            const usersWithEmail = await res.json();
            const match = usersWithEmail.find((u) => (u.password || '').trim() === pass);
            
            if (match) {
                authenticatedUser = match;
                activateSession();
            } else {
                document.getElementById('loginFormGeneralError').textContent = '❌ Incorrect Email or Password.';
                document.getElementById('loginFormGeneralError').classList.remove('hidden');
            }
        } catch (err) {
            document.getElementById('loginFormGeneralError').textContent = "⚠️ Cannot reach database. Run JSON Server!";
            document.getElementById('loginFormGeneralError').classList.remove('hidden');
        }
    });
}

function validateSignupForm() {
    let valid = true;
    const name = document.getElementById('signupName');
    const email = document.getElementById('signupEmail');
    const pass = document.getElementById('signupPassword');
    
    if (name.value.length < 3) { document.getElementById('signupNameError').textContent = 'Name required'; valid = false; }
    else { document.getElementById('signupNameError').textContent = ''; }
    
    if (!email.value.includes('@')) { document.getElementById('signupEmailError').textContent = 'Valid email required'; valid = false; }
    else { document.getElementById('signupEmailError').textContent = ''; }
    
    if (pass.value.length < 4) { document.getElementById('signupPasswordError').textContent = 'Password required'; valid = false; }
    else { document.getElementById('signupPasswordError').textContent = ''; }
    return valid;
}

function validateLoginForm() {
    let valid = true;
    if (!document.getElementById('loginEmail').value.includes('@')) { document.getElementById('loginEmailError').textContent = 'Valid email required'; valid = false; }
    else { document.getElementById('loginEmailError').textContent = ''; }
    if (!document.getElementById('loginPassword').value) { document.getElementById('loginPasswordError').textContent = 'Password required'; valid = false; }
    else { document.getElementById('loginPasswordError').textContent = ''; }
    return valid;
}

function activateSession() {
    document.getElementById('navBrowse').style.display = 'inline-block';
    document.getElementById('navCart').style.display = 'inline-block';
    document.getElementById('navRequests').style.display = 'inline-block';
    document.getElementById('logoutBtn').style.display = 'inline-block';
    
    // Pre-fill user details for checkout automatically
    document.getElementById('custName').value = authenticatedUser.name;
    document.getElementById('custEmail').value = authenticatedUser.email;
    document.getElementById('reqUserName').value = authenticatedUser.name;
    document.getElementById('reqUserEmail').value = authenticatedUser.email;
    localStorage.setItem('bookifyUserSession', JSON.stringify(authenticatedUser));
    
    switchView('browseSection');
    fetchLoadBooks();
    fetchLoadDeals();
}

function restoreUserSession() {
    try {
        const saved = localStorage.getItem('bookifyUserSession');
        if (!saved) return;
        authenticatedUser = JSON.parse(saved);
        if (authenticatedUser && authenticatedUser.name && authenticatedUser.email) {
            activateSession();
        }
    } catch (e) {
        localStorage.removeItem('bookifyUserSession');
    }
}

// --- BROWSER PAGE & FILTERS ---
async function fetchLoadBooks() {
    const loading = document.getElementById('fetchLoadingState');
    const errorBanner = document.getElementById('fetchErrorState');
    loading.classList.remove('hidden');
    errorBanner.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_URL}/books`);
        if (!response.ok) throw new Error('Fetch failed');
        appBooks = await response.json();
        applyFilterAndSort();
    } catch (err) {
        errorBanner.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
    }
}

async function fetchLoadDeals() {
    try {
        const res = await fetch(`${API_URL}/deals`);
        if (res.ok) {
            const deals = await res.json();
            await markExpiredDealsInactive(deals);
            activeDeals = deals.filter(isDealInActiveRange);
            renderDealBanners();
        }
    } catch (e) {}
}

function renderDealBanners() {
    const targets = [document.getElementById('landingDealsContainer'), document.getElementById('browseDealsContainer')];
    targets.forEach(container => {
        if (!container) return;
        container.innerHTML = '';

        if (!activeDeals.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-msg';
            empty.textContent = 'No active deals right now.';
            container.appendChild(empty);
            return;
        }

        activeDeals.forEach(deal => {
            const dealDiv = document.createElement('button');
            dealDiv.type = 'button';
            dealDiv.className = 'deal-card clickable-deal-card';
            dealDiv.innerHTML = `
                <div class="deal-content">
                    <h4>🎁 ${deal.productName || 'Special Deal'}</h4>
                    <p>Discounted Price: $${Number(deal.discountedPrice || 0).toFixed(2)}</p>
                    <small>${formatDealDate(deal.fromDate)} - ${formatDealDate(deal.toDate)}</small>
                </div>
                <img src="${deal.image || 'read.jpg'}" alt="${deal.productName || 'Deal'}" class="deal-mini-logo" onerror="this.src='read.jpg'">
            `;
            const title = dealDiv.querySelector('h4');
            if (title) {
                title.textContent = deal.dealName || deal.productName || 'Special Deal';
                if (deal.dealName && deal.productName) {
                    const productLine = document.createElement('p');
                    productLine.className = 'deal-product-name';
                    productLine.textContent = deal.productName;
                    title.insertAdjacentElement('afterend', productLine);
                }
            }
            dealDiv.addEventListener('click', () => openDealModal(deal));
            container.appendChild(dealDiv);
        });
    });
}

function initDealModal() {
    const modal = document.getElementById('dealModal');
    const closeBtn = document.getElementById('dealModalCloseBtn');
    const buyNowBtn = document.getElementById('dealBuyNowBtn');
    if (!modal || !closeBtn || !buyNowBtn) return;

    closeBtn.addEventListener('click', closeDealModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeDealModal();
        }
    });
    buyNowBtn.addEventListener('click', onDealBuyNow);
}

function openDealModal(deal) {
    const modal = document.getElementById('dealModal');
    if (!modal) return;

    document.getElementById('dealModalTitle').textContent = deal.dealName || deal.productName || 'Special Deal';
    document.getElementById('dealModalDiscountedPrice').textContent = `$${Number(deal.discountedPrice || 0).toFixed(2)}`;
    document.getElementById('dealModalStock').textContent = `${deal.stock ?? 0}`;
    document.getElementById('dealModalColor').textContent = deal.color || '-';
    document.getElementById('dealModalSize').textContent = deal.size || '-';
    document.getElementById('dealModalRange').textContent = `${formatDealDate(deal.fromDate)} to ${formatDealDate(deal.toDate)}`;
    document.getElementById('dealModalImage').src = deal.image || 'read.jpg';
    selectedDealForCheckout = deal;

    modal.classList.remove('hidden');
}

function closeDealModal() {
    const modal = document.getElementById('dealModal');
    if (!modal) return;
    modal.classList.add('hidden');
}

function onDealBuyNow() {
    if (!selectedDealForCheckout) return;
    const discountedPrice = Number(selectedDealForCheckout.discountedPrice || 0);
    if (discountedPrice <= 0) return;

    shoppingCart = [{
        bookId: `deal-${selectedDealForCheckout.id || Date.now()}`,
        title: selectedDealForCheckout.productName || 'Special Deal',
        price: discountedPrice,
        image: selectedDealForCheckout.image || 'read.jpg',
        qty: 1
    }];
    updateCartBadge();
    closeDealModal();
    switchView('checkoutSection');
    calculateCheckoutPrices();
}

function formatDealDate(dateValue) {
    if (!dateValue) return '-';
    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) return '-';
    return parsedDate.toLocaleDateString();
}

function initCatalogHandlers() {
    document.getElementById('categoryFilter').addEventListener('change', applyFilterAndSort);
    document.getElementById('priceSort').addEventListener('change', applyFilterAndSort);
}

function applyFilterAndSort() {
    const catVal = document.getElementById('categoryFilter').value;
    const sortVal = document.getElementById('priceSort').value;
    
    let filtered = [...appBooks];
    if (catVal !== 'all') { filtered = filtered.filter(b => b.category === catVal); }
    if (sortVal === 'low-high') { filtered.sort((a, b) => a.price - b.price); }
    if (sortVal === 'high-low') { filtered.sort((a, b) => b.price - a.price); }
    
    renderBooksGrid(filtered);
}

function renderBooksGrid(books) {
    const grid = document.getElementById('booksGrid');
    grid.innerHTML = '';
    
    if (books.length === 0) {
        grid.innerHTML = '<p class="empty-msg">No books match this category.</p>';
        return;
    }
    
    books.forEach(book => {
        const card = document.createElement('div');
        card.className = 'book-card';
        let stars = '⭐'.repeat(book.rating || 5);
        
        card.innerHTML = `
            <div class="book-img-box">
                <img src="${book.image}" alt="${book.title}" onerror="this.src='read.jpg'">
            </div>
            <div class="book-info">
                <h4>${book.title}</h4>
                <p class="author-label">Author: ${book.author}</p>
                <p class="category-badge">${book.category}</p>
                <div class="rating-row" style="margin-bottom:10px;">Ratings: ${stars}</div>
                <div class="purchase-row">
                    <span class="price-tag">$${book.price.toFixed(2)}</span>
                    <button class="btn btn-sm btn-primary" onclick="addToCart('${book.id}')">Add to Cart</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- CART LOGIC ---
window.addToCart = function(id) {
    const targetBook = appBooks.find(b => b.id === id);
    if (!targetBook) return;
    
    const existingItem = shoppingCart.find(item => item.bookId === id);
    if (existingItem) {
        existingItem.qty++;
    } else {
        shoppingCart.push({
            bookId: id,
            title: targetBook.title,
            price: targetBook.price,
            image: targetBook.image,
            qty: 1
        });
    }
    updateCartBadge();
    const activeBtn = event.target;
    const oldText = activeBtn.innerHTML;
    activeBtn.innerHTML = "Added! ✓";
    setTimeout(() => { activeBtn.innerHTML = oldText; }, 1000);
};

function updateCartBadge() {
    const count = shoppingCart.reduce((acc, curr) => acc + curr.qty, 0);
    document.getElementById('cartCount').textContent = count;
}

function renderCart() {
    const container = document.getElementById('cartItemsContainer');
    container.innerHTML = '';
    
    if (shoppingCart.length === 0) {
        container.innerHTML = '<p class="empty-msg">Cart is empty.</p>';
        document.getElementById('subtotalAmount').textContent = '$0.00';
        return;
    }
    
    let subtotal = 0;
    shoppingCart.forEach(item => {
        const itemTotal = item.price * item.qty;
        subtotal += itemTotal;
        
        const row = document.createElement('div');
        row.className = 'cart-item-row';
        row.innerHTML = `
            <img src="${item.image}" alt="${item.title}" onerror="this.src='read.jpg'">
            <div class="item-details">
                <h4>${item.title}</h4>
                <p>$${item.price.toFixed(2)} each</p>
            </div>
            <div class="qty-controls">
                <button class="btn btn-qty" onclick="changeQty('${item.bookId}', -1)">-</button>
                <span style="font-weight:600;">${item.qty}</span>
                <button class="btn btn-qty" onclick="changeQty('${item.bookId}', 1)">+</button>
            </div>
            <div class="item-actions">
                <span class="row-total">$${itemTotal.toFixed(2)}</span>
                <button class="btn btn-danger btn-sm" onclick="removeFromCart('${item.bookId}')">Remove</button>
            </div>
        `;
        container.appendChild(row);
    });
    
    document.getElementById('subtotalAmount').textContent = `$${subtotal.toFixed(2)}`;
}

window.changeQty = function(id, delta) {
    const item = shoppingCart.find(i => i.bookId === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) removeFromCart(id);
    else { updateCartBadge(); renderCart(); }
};

window.removeFromCart = function(id) {
    shoppingCart = shoppingCart.filter(i => i.bookId !== id);
    updateCartBadge();
    renderCart();
};

// --- CHECKOUT LOGIC ---
function initCartCheckout() {
    document.getElementById('proceedToCheckoutBtn').addEventListener('click', () => {
        if (shoppingCart.length === 0) return;
        switchView('checkoutSection');
        calculateCheckoutPrices();
    });

    // Conditional Debit Card Details
    const radios = document.querySelectorAll('input[name="paymentMethod"]');
    radios.forEach(r => r.addEventListener('change', (e) => {
        const cardBox = document.getElementById('cardDetailsContainer');
        if (e.target.value === 'Debit Card') {
            cardBox.classList.remove('hidden');
        } else {
            cardBox.classList.add('hidden');
        }
    }));

    const checkoutForm = document.getElementById('checkoutForm');
    checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateCheckoutForm()) return;

        const sub = shoppingCart.reduce((sum, i) => sum + (i.price * i.qty), 0);
        const isDealCheckout = shoppingCart.length === 1 && String(shoppingCart[0].bookId).startsWith('deal-');
        const shippingFee = isDealCheckout ? 0 : 5.00;
        const finalOrder = {
            customerName: document.getElementById('custName').value.trim(),
            customerEmail: document.getElementById('custEmail').value.trim(),
            address: document.getElementById('custAddress').value.trim(),
            city: document.getElementById('custCity').value.trim(),
            postalCode: document.getElementById('custPostal').value.trim(),
            paymentMethod: document.querySelector('input[name="paymentMethod"]:checked').value,
            items: shoppingCart,
            totalCost: sub + shippingFee,
            status: 'Pending'
        };
        
        try {
            const res = await fetch(`${API_URL}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalOrder)
            });
            if (res.ok) {
                shoppingCart = [];
                updateCartBadge();
                setInlineMessage('checkoutSuccessMessage', 'Order Confirmed Successfully!', 'success');
                
                setTimeout(() => {
                    document.getElementById('checkoutSuccessMessage').classList.add('hidden');
                    checkoutForm.reset();
                    switchView('browseSection');
                }, 3000);
            }
        } catch (err) {
            setInlineMessage('checkoutSuccessMessage', 'Could not place the order. Please make sure JSON Server is running.');
        }
    });
}

function calculateCheckoutPrices() {
    const sub = shoppingCart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const isDealCheckout = shoppingCart.length === 1 && String(shoppingCart[0].bookId).startsWith('deal-');
    const shippingFee = isDealCheckout ? 0 : 5.00;
    document.getElementById('checkSub').textContent = `$${sub.toFixed(2)}`;
    document.getElementById('checkShipping').textContent = `$${shippingFee.toFixed(2)}`;
    document.getElementById('checkTotal').textContent = `$${(sub + shippingFee).toFixed(2)}`;
}

function validateCheckoutForm() {
    let valid = true;
    const fields = ['custName', 'custEmail', 'custAddress', 'custCity', 'custPostal'];
    fields.forEach(f => {
        const el = document.getElementById(f);
        const err = document.getElementById(f + 'Error');
        if (!el.value.trim()) { err.textContent = 'Required'; valid = false; }
        else { err.textContent = ''; }
    });

    const payment = document.querySelector('input[name="paymentMethod"]:checked').value;
    if (payment === 'Debit Card') {
        const cardNum = document.getElementById('cardNum');
        const cardErr = document.getElementById('cardNumError');
        if (cardNum.value.trim().length < 12) { cardErr.textContent = 'Valid card needed'; valid = false; }
        else { cardErr.textContent = ''; }
    }
    return valid;
}

// --- REQUESTS & COMPLAINTS ---
function initRequestForm() {
    const form = document.getElementById('complaintRequestForm');
    const typeSelect = document.getElementById('reqType');
    const fieldsContainer = document.getElementById('dynamicRequestFields');

    if (!form || !typeSelect || !fieldsContainer) return;

    const renderDynamicFields = () => {
        const selectedType = typeSelect.value;
        fieldsContainer.innerHTML = '';

        if (selectedType === 'Missing Book') {
            fieldsContainer.innerHTML = `
                <div class="form-group">
                    <label>Book Name</label>
                    <input type="text" id="reqBookName" required>
                </div>
                <div class="form-group">
                    <label>Author Name (Optional)</label>
                    <input type="text" id="reqAuthorName">
                </div>
            `;
            return;
        }

        if (selectedType === 'Wrong Book') {
            fieldsContainer.innerHTML = `
                <div class="form-row">
                    <div class="form-group">
                        <label>Wrong Delivered Book Name</label>
                        <input type="text" id="wrongDeliveredBookName" required>
                    </div>
                    <div class="form-group">
                        <label>Book Name You Ordered</label>
                        <input type="text" id="orderedBookName" required>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Author Name (Optional)</label>
                        <input type="text" id="wrongBookAuthorName">
                    </div>
                    <div class="form-group">
                        <label>Order Number</label>
                        <input type="text" id="wrongBookOrderNumber" required placeholder="e.g., ORD-1001">
                    </div>
                </div>
            `;
            return;
        }

        if (selectedType === 'Delivery Issue') {
            fieldsContainer.innerHTML = `
                <div class="form-row">
                    <div class="form-group">
                        <label>Order Number</label>
                        <input type="text" id="deliveryOrderNumber" required placeholder="e.g., ORD-1001">
                    </div>
                    <div class="form-group">
                        <label>Book Name</label>
                        <input type="text" id="deliveryBookName" required>
                    </div>
                </div>
                <div class="form-group">
                    <label>Delivery Reason</label>
                    <select id="deliveryReason" required>
                        <option value="">Select a reason</option>
                        <option value="Not delivered on time">Not delivered on time</option>
                        <option value="Package not received">Package not received</option>
                        <option value="Damaged package">Damaged package</option>
                        <option value="Courier issue">Courier issue</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Delivery Issue Details</label>
                    <textarea id="deliveryIssueDetails" rows="3" required placeholder="Mention the issue, expected time/date, or any delivery delay details."></textarea>
                </div>
            `;
        }
    };

    const getFieldValue = (id) => document.getElementById(id)?.value.trim() || '';

    const populateRequestIdentity = () => {
        if (!authenticatedUser) return;
        document.getElementById('reqUserName').value = authenticatedUser.name || '';
        document.getElementById('reqUserEmail').value = authenticatedUser.email || '';
    };

    const buildRequestPayload = () => {
        const requestType = typeSelect.value;
        const payload = {
            type: requestType,
            userName: getFieldValue('reqUserName'),
            userEmail: getFieldValue('reqUserEmail'),
            status: 'Pending',
            createdAt: new Date().toISOString()
        };

        if (!payload.userName) throw new Error('Please enter your user name.');
        if (!payload.userEmail) throw new Error('Please enter your user email.');

        if (requestType === 'Missing Book') {
            payload.bookName = getFieldValue('reqBookName');
            payload.authorName = getFieldValue('reqAuthorName');
            if (!payload.bookName) throw new Error('Please enter the book name you want to request.');
            return payload;
        }

        if (requestType === 'Wrong Book') {
            payload.wrongDeliveredBook = getFieldValue('wrongDeliveredBookName');
            payload.orderedBookName = getFieldValue('orderedBookName');
            payload.authorName = getFieldValue('wrongBookAuthorName');
            payload.orderNumber = getFieldValue('wrongBookOrderNumber');
            if (!payload.wrongDeliveredBook) throw new Error('Please enter the wrong delivered book name.');
            if (!payload.orderedBookName) throw new Error('Please enter the book name you ordered.');
            if (!payload.orderNumber) throw new Error('Please enter the order number.');
            return payload;
        }

        if (requestType === 'Delivery Issue') {
            payload.orderNumber = getFieldValue('deliveryOrderNumber');
            payload.bookName = getFieldValue('deliveryBookName');
            payload.deliveryReason = getFieldValue('deliveryReason');
            payload.deliveryIssue = getFieldValue('deliveryIssueDetails');
            if (!payload.orderNumber) throw new Error('Please enter the order number.');
            if (!payload.bookName) throw new Error('Please enter the book name.');
            if (!payload.deliveryReason) throw new Error('Please select a delivery reason.');
            if (!payload.deliveryIssue) throw new Error('Please describe the delivery issue.');
            return payload;
        }

        throw new Error('Please select a valid form type.');
    };

    renderDynamicFields();
    populateRequestIdentity();
    typeSelect.addEventListener('change', renderDynamicFields);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearInlineMessage('requestSuccessMessage');

        let payload;
        try {
            payload = buildRequestPayload();
        } catch (err) {
            setInlineMessage('requestSuccessMessage', err.message);
            return;
        }
        
        try {
            const res = await fetch(`${API_URL}/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setInlineMessage('requestSuccessMessage', 'Request submitted successfully!', 'success');
                setTimeout(() => {
                    document.getElementById('requestSuccessMessage').classList.add('hidden');
                    form.reset();
                    populateRequestIdentity();
                    renderDynamicFields();
                }, 3000);
            } else {
                setInlineMessage('requestSuccessMessage', 'Could not submit your request. Please try again.');
            }
        } catch (err) {
            setInlineMessage('requestSuccessMessage', 'Could not submit your request. Please make sure JSON Server is running.');
        }
    });
}
