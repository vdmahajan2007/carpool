// ============================================================
// Carpool Tracker — Shared Application Module
// ============================================================
(function () {
    'use strict';

    // ── Constants ──────────────────────────────────────────────
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    const NAV_ITEMS = [
        { id: 'dashboard', label: 'Dashboard', icon: 'bi-speedometer2', href: 'index.html', bottomNav: true },
        { id: 'trips', label: 'Trips', icon: 'bi-car-front', href: 'trips.html', bottomNav: true },
        { id: 'calendar', label: 'Calendar', icon: 'bi-calendar3', href: 'calendar.html', bottomNav: true },
        { id: 'settlement', label: 'Settlement', icon: 'bi-cash-coin', href: 'settlement.html', bottomNav: true },
        { id: 'people', label: 'People', icon: 'bi-people', href: 'people.html', bottomNav: false },
        { id: 'reports', label: 'Reports', icon: 'bi-bar-chart-line', href: 'reports.html', bottomNav: false },
        { id: 'settings', label: 'Settings', icon: 'bi-gear', href: 'settings.html', bottomNav: false },
    ];

    const DEFAULT_SETTINGS = {
        carName: 'Tata Tiago',
        fuelType: 'Petrol',
        mileage: 12,
        petrolPrice: 105,
        petrolPriceUpdated: new Date().toISOString().split('T')[0],
        driverName: 'Vivek',
        driverId: 'vivek',
        sharingMode: 'equal',
        customPercentages: {},
        tripExpiryHours: 4
    };

    const DEFAULT_PEOPLE = [
        { id: 'vivek', name: 'Vivek', role: 'Driver', distance: 17, phone: '', active: true },
        { id: 'jaydeep', name: 'Jaydeep', role: 'Passenger', distance: 8, phone: '', active: true },
        { id: 'madhura', name: 'Madhura', role: 'Passenger', distance: 10, phone: '', active: true },
    ];

    // ── Application State ─────────────────────────────────────
    const state = {
        user: null,
        settings: null,
        people: null,
        activePage: null,
        initialized: false
    };

    // ── Authentication ────────────────────────────────────────
    async function signInAnonymously() {
        try {
            const result = await auth.signInAnonymously();
            state.user = result.user;
            return result.user;
        } catch (error) {
            console.error('Auth error:', error);
            showToast('Authentication failed. Some features may not work.', 'danger');
            return null;
        }
    }

    // ── Settings CRUD ─────────────────────────────────────────
    async function loadSettings(forceRefresh) {
        if (state.settings && !forceRefresh) return state.settings;
        try {
            const doc = await db.collection('settings').doc('car').get();
            if (doc.exists) {
                state.settings = doc.data();
            } else {
                await initializeDefaults();
                state.settings = { ...DEFAULT_SETTINGS };
            }
            return state.settings;
        } catch (error) {
            console.error('Error loading settings:', error);
            state.settings = { ...DEFAULT_SETTINGS };
            return state.settings;
        }
    }

    function getSettings() {
        return state.settings || { ...DEFAULT_SETTINGS };
    }

    async function saveSettings(data) {
        try {
            await db.collection('settings').doc('car').set(data, { merge: true });
            state.settings = { ...state.settings, ...data };
            showToast('Settings saved successfully.', 'success');
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            showToast('Failed to save settings.', 'danger');
            return false;
        }
    }

    // ── People CRUD ───────────────────────────────────────────
    async function loadPeople(forceRefresh) {
        if (state.people && !forceRefresh) return state.people;
        try {
            const snapshot = await db.collection('people').orderBy('name').get();
            state.people = [];
            snapshot.forEach(doc => state.people.push({ id: doc.id, ...doc.data() }));
            if (state.people.length === 0) {
                await initializeDefaults();
                return loadPeople(true);
            }
            return state.people;
        } catch (error) {
            console.error('Error loading people:', error);
            state.people = [...DEFAULT_PEOPLE];
            return state.people;
        }
    }

    function getPeople() {
        return state.people || [...DEFAULT_PEOPLE];
    }

    function getActivePeople() {
        const people = getPeople();
        return people.filter(p => p.active !== false);
    }

    function getPassengers() {
        const active = getActivePeople();
        return active.filter(p => p.role === 'Passenger');
    }

    function getDriver() {
        const active = getActivePeople();
        return active.find(p => p.role === 'Driver') || null;
    }

    async function savePerson(data) {
        try {
            const id = data.id || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const saveData = { ...data };
            delete saveData.id;
            await db.collection('people').doc(id).set(saveData, { merge: true });
            state.people = null;
            showToast(data.name + ' saved successfully.', 'success');
            return id;
        } catch (error) {
            console.error('Error saving person:', error);
            showToast('Failed to save person.', 'danger');
            return null;
        }
    }

    async function deletePerson(id) {
        try {
            await db.collection('people').doc(id).delete();
            state.people = null;
            showToast('Person removed.', 'success');
            return true;
        } catch (error) {
            console.error('Error deleting person:', error);
            showToast('Failed to remove person.', 'danger');
            return false;
        }
    }

    // ── Trips CRUD ────────────────────────────────────────────
    async function getTrips(filters) {
        filters = filters || {};
        try {
            let query = db.collection('trips').orderBy('date', 'desc');

            if (filters.month !== undefined && filters.year !== undefined) {
                const mm = String(filters.month + 1).padStart(2, '0');
                const startDate = filters.year + '-' + mm + '-01';
                const endMonth = filters.month + 2 > 12 ? 1 : filters.month + 2;
                const endYear = filters.month + 2 > 12 ? filters.year + 1 : filters.year;
                const endDate = endYear + '-' + String(endMonth).padStart(2, '0') + '-01';
                query = query.where('date', '>=', startDate).where('date', '<', endDate);
            }

            const snapshot = await query.get();
            let trips = [];
            snapshot.forEach(doc => trips.push({ id: doc.id, ...doc.data() }));

            if (filters.passenger) {
                trips = trips.filter(t => t.passengers && t.passengers.includes(filters.passenger));
            }
            if (filters.status) {
                trips = trips.filter(t => t.status === filters.status);
            }
            return trips;
        } catch (error) {
            console.error('Error loading trips:', error);
            showToast('Failed to load trips.', 'danger');
            return [];
        }
    }

    async function getTrip(id) {
        try {
            const doc = await db.collection('trips').doc(id).get();
            return doc.exists ? { id: doc.id, ...doc.data() } : null;
        } catch (error) {
            console.error('Error loading trip:', error);
            return null;
        }
    }

    async function saveTrip(data) {
        try {
            const id = data.id || generateId();
            const tripData = { ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            if (!data.id) tripData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            delete tripData.id;
            await db.collection('trips').doc(id).set(tripData, { merge: true });
            showToast('Trip saved successfully.', 'success');
            return id;
        } catch (error) {
            console.error('Error saving trip:', error);
            showToast('Failed to save trip.', 'danger');
            return null;
        }
    }

    async function updateTrip(id, data) {
        try {
            await db.collection('trips').doc(id).update({
                ...data,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error('Error updating trip:', error);
            showToast('Failed to update trip.', 'danger');
            return false;
        }
    }

    async function deleteTrip(id) {
        try {
            await db.collection('trips').doc(id).delete();
            showToast('Trip deleted.', 'success');
            return true;
        } catch (error) {
            console.error('Error deleting trip:', error);
            showToast('Failed to delete trip.', 'danger');
            return false;
        }
    }

    // ── Payments CRUD ─────────────────────────────────────────
    async function getPayments(filters) {
        filters = filters || {};
        try {
            let query = db.collection('payments');
            if (filters.personId) query = query.where('personId', '==', filters.personId);
            if (filters.month !== undefined && filters.year !== undefined) {
                query = query.where('month', '==', filters.month).where('year', '==', filters.year);
            }
            const snapshot = await query.get();
            const payments = [];
            snapshot.forEach(doc => payments.push({ id: doc.id, ...doc.data() }));
            return payments;
        } catch (error) {
            console.error('Error loading payments:', error);
            return [];
        }
    }

    async function savePayment(data) {
        try {
            const id = data.id || generateId();
            const paymentData = { ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
            delete paymentData.id;
            await db.collection('payments').doc(id).set(paymentData, { merge: true });
            showToast('Payment recorded.', 'success');
            return id;
        } catch (error) {
            console.error('Error saving payment:', error);
            showToast('Failed to record payment.', 'danger');
            return null;
        }
    }

    async function deletePayment(id) {
        try {
            await db.collection('payments').doc(id).delete();
            showToast('Payment deleted.', 'success');
            return true;
        } catch (error) {
            console.error('Error deleting payment:', error);
            return false;
        }
    }

    // ── Calculation Engine ────────────────────────────────────
    function calculateFuelUsed(distance, mileage) {
        if (!mileage || mileage <= 0 || !distance || distance <= 0) return 0;
        return parseFloat((distance / mileage).toFixed(2));
    }

    function calculateFuelCost(distance, mileage, petrolPrice) {
        var fuel = calculateFuelUsed(distance, mileage);
        return parseFloat((fuel * petrolPrice).toFixed(2));
    }

    /**
     * Calculate each passenger's share of the fuel cost.
     * @param {number} totalCost - Total fuel cost for the trip
     * @param {Array} passengers - Array of passenger objects or IDs
     * @param {string} mode - Sharing mode: equal | passenger-only | custom-percentage | custom-amount
     * @param {Object} customData - { percentages: {id: pct}, amounts: {id: amt} }
     * @returns {Object} shares keyed by passenger id
     */
    function calculateShares(totalCost, passengers, mode, customData) {
        var shares = {};
        if (!passengers || passengers.length === 0) return shares;
        customData = customData || {};

        switch (mode) {
            case 'equal': {
                var totalPeople = passengers.length + 1; // driver included
                var perPerson = totalCost / totalPeople;
                passengers.forEach(function (p) {
                    shares[p.id || p] = parseFloat(perPerson.toFixed(2));
                });
                break;
            }
            case 'passenger-only': {
                var perPassenger = totalCost / passengers.length;
                passengers.forEach(function (p) {
                    shares[p.id || p] = parseFloat(perPassenger.toFixed(2));
                });
                break;
            }
            case 'custom-percentage': {
                passengers.forEach(function (p) {
                    var pid = p.id || p;
                    var pct = (customData.percentages && customData.percentages[pid]) || 0;
                    shares[pid] = parseFloat((totalCost * pct / 100).toFixed(2));
                });
                break;
            }
            case 'custom-amount': {
                passengers.forEach(function (p) {
                    var pid = p.id || p;
                    shares[pid] = (customData.amounts && customData.amounts[pid]) || 0;
                });
                break;
            }
            default: {
                var fp = passengers.length + 1;
                var pp = totalCost / fp;
                passengers.forEach(function (p) {
                    shares[p.id || p] = parseFloat(pp.toFixed(2));
                });
            }
        }
        return shares;
    }

    /**
     * Get the default total distance for a trip based on type.
     * @param {string} tripType - Office | Return | Full Day | Custom
     * @param {number} driverDistance - Driver's one-way distance
     * @returns {number} Default total distance
     */
    function getDefaultDistance(tripType, driverDistance) {
        switch (tripType) {
            case 'Office': return driverDistance;           // one way
            case 'Return': return driverDistance;            // one way (return leg)
            case 'Full Day': return driverDistance * 2;      // round trip
            case 'Custom': return 0;
            default: return driverDistance;
        }
    }

    // ── Formatting ────────────────────────────────────────────
    function formatCurrency(amount) {
        if (amount === null || amount === undefined || isNaN(amount)) return '₹0.00';
        return '₹' + parseFloat(amount).toFixed(2);
    }

    function formatCurrencyShort(amount) {
        if (amount === null || amount === undefined || isNaN(amount)) return '₹0';
        var val = parseFloat(amount);
        if (Math.abs(val) >= 1000) return '₹' + (val / 1000).toFixed(1) + 'K';
        return '₹' + val.toFixed(0);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        var parts = dateStr.split('-');
        if (parts.length === 3) return parts[2] + '-' + parts[1] + '-' + parts[0];
        var d = new Date(dateStr);
        return d.toLocaleDateString('en-IN');
    }

    function formatDateShort(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }

    function formatDateISO(date) {
        var d = date || new Date();
        var yyyy = d.getFullYear();
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var dd = String(d.getDate()).padStart(2, '0');
        return yyyy + '-' + mm + '-' + dd;
    }

    function formatTime(date) {
        if (!date) return '';
        var d = (typeof date === 'string' || typeof date === 'number') ? new Date(date) : date;
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    }

    function formatDateTime(date) {
        if (!date) return '';
        var d = (typeof date === 'string' || typeof date === 'number') ? new Date(date) : date;
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + formatTime(d);
    }

    function timeAgo(timestamp) {
        if (!timestamp) return '';
        var seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 0) seconds = 0;
        if (seconds < 10) return 'Just now';
        if (seconds < 60) return seconds + ' seconds ago';
        var minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + ' minute' + (minutes !== 1 ? 's' : '') + ' ago';
        var hours = Math.floor(minutes / 60);
        return hours + ' hour' + (hours !== 1 ? 's' : '') + ' ago';
    }

    // ── Navigation ────────────────────────────────────────────
    function initNavigation(activePage) {
        state.activePage = activePage;
        if (activePage === 'track') return; // track.html has its own layout
        renderSidebar(activePage);
        renderTopBar(activePage);
        renderBottomNav(activePage);
    }

    function renderSidebar(activePage) {
        var sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        var navLinks = NAV_ITEMS.map(function (item) {
            var active = item.id === activePage ? 'active' : '';
            return '<a href="' + item.href + '" class="sidebar-link ' + active + '">' +
                '<i class="bi ' + item.icon + '"></i>' +
                '<span>' + item.label + '</span></a>';
        }).join('');

        sidebar.innerHTML =
            '<div class="sidebar-brand">' +
            '<i class="bi bi-car-front-fill"></i>' +
            '<span>Carpool</span></div>' +
            '<nav class="sidebar-nav">' + navLinks + '</nav>' +
            '<div class="sidebar-footer">' +
            '<small class="text-muted">Carpool Tracker v1.0</small></div>';
    }

    function renderTopBar(activePage) {
        var topbar = document.getElementById('topbar');
        if (!topbar) return;

        var now = new Date();
        var monthYear = MONTHS[now.getMonth()] + ' ' + now.getFullYear();
        var pageItem = NAV_ITEMS.find(function (i) { return i.id === activePage; });
        var pageTitle = pageItem ? pageItem.label : '';
        var driverName = (state.settings && state.settings.driverName) || 'Vivek';

        topbar.innerHTML =
            '<div class="d-flex align-items-center justify-content-between w-100 px-3 px-md-4">' +
            '<div class="d-flex align-items-center gap-2">' +
            '<div><h6 class="mb-0 d-md-none">' + pageTitle + '</h6>' +
            '<h6 class="mb-0 d-none d-md-block">' + monthYear + '</h6></div></div>' +
            '<div class="d-flex align-items-center gap-3">' +
            '<span id="topbarLiveIndicator" class="live-badge d-none">' +
            '<span class="live-dot"></span> LIVE</span>' +
            '<span class="text-muted d-none d-md-inline">' +
            '<i class="bi bi-person-circle"></i> ' + driverName + '</span></div></div>';
    }

    function renderBottomNav(activePage) {
        var bottomNav = document.getElementById('bottomnav');
        if (!bottomNav) return;

        var bottomItems = NAV_ITEMS.filter(function (i) { return i.bottomNav; });
        var isMorePage = ['people', 'reports', 'settings'].indexOf(activePage) !== -1;

        var navLinks = bottomItems.map(function (item) {
            var active = item.id === activePage ? 'active' : '';
            return '<a href="' + item.href + '" class="bottom-nav-item ' + active + '">' +
                '<i class="bi ' + item.icon + '"></i>' +
                '<span>' + item.label + '</span></a>';
        }).join('');

        var moreActive = isMorePage ? 'active' : '';
        bottomNav.innerHTML = navLinks +
            '<a href="#" class="bottom-nav-item ' + moreActive + '" data-bs-toggle="offcanvas" data-bs-target="#moreMenuOffcanvas">' +
            '<i class="bi bi-three-dots"></i><span>More</span></a>';

        // Create offcanvas for "More" menu
        if (!document.getElementById('moreMenuOffcanvas')) {
            var moreItems = NAV_ITEMS.filter(function (i) { return !i.bottomNav; });
            var moreLinks = moreItems.map(function (item) {
                var active = item.id === activePage ? 'active' : '';
                return '<a href="' + item.href + '" class="more-menu-item ' + active + '">' +
                    '<i class="bi ' + item.icon + '"></i><span>' + item.label + '</span></a>';
            }).join('');

            var offcanvasDiv = document.createElement('div');
            offcanvasDiv.innerHTML =
                '<div class="offcanvas offcanvas-bottom rounded-top-4" id="moreMenuOffcanvas" tabindex="-1" style="height:auto;">' +
                '<div class="offcanvas-header"><h6 class="offcanvas-title">More</h6>' +
                '<button type="button" class="btn-close" data-bs-dismiss="offcanvas"></button></div>' +
                '<div class="offcanvas-body pb-4"><div class="more-menu-grid">' +
                moreLinks + '</div></div></div>';
            document.body.appendChild(offcanvasDiv.firstElementChild);
        }
    }

    // ── Toast Notifications ───────────────────────────────────
    function showToast(message, type) {
        type = type || 'info';
        var container = document.getElementById('toastContainer');
        if (!container) return;

        var icons = {
            success: 'bi-check-circle-fill',
            danger: 'bi-exclamation-triangle-fill',
            warning: 'bi-exclamation-circle-fill',
            info: 'bi-info-circle-fill'
        };

        var toastId = 'toast-' + Date.now();
        var toastDiv = document.createElement('div');
        toastDiv.innerHTML =
            '<div id="' + toastId + '" class="toast align-items-center text-bg-' + type + ' border-0" role="alert">' +
            '<div class="d-flex"><div class="toast-body">' +
            '<i class="bi ' + (icons[type] || icons.info) + ' me-2"></i>' +
            escapeHtml(message) +
            '</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>' +
            '</div></div>';
        container.appendChild(toastDiv.firstElementChild);

        var el = document.getElementById(toastId);
        var toast = new bootstrap.Toast(el, { delay: 3500 });
        toast.show();
        el.addEventListener('hidden.bs.toast', function () { this.remove(); });
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ── WhatsApp ──────────────────────────────────────────────
    function openWhatsApp(phone, message) {
        var cleanPhone = (phone || '').replace(/[^0-9]/g, '');
        var encoded = encodeURIComponent(message);
        var url = cleanPhone
            ? 'https://wa.me/' + cleanPhone + '?text=' + encoded
            : 'https://wa.me/?text=' + encoded;
        window.open(url, '_blank');
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!', 'success');
        } catch (e) {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('Copied to clipboard!', 'success');
        }
    }

    // ── Data Export / Import ──────────────────────────────────
    function exportCSV(headers, rows, filename) {
        var csvContent = [
            headers.join(','),
            ...rows.map(function (row) {
                return row.map(function (cell) {
                    var str = String(cell === null || cell === undefined ? '' : cell);
                    return (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1)
                        ? '"' + str.replace(/"/g, '""') + '"'
                        : str;
                }).join(',');
            })
        ].join('\r\n');

        // BOM prefix for Excel UTF-8 compatibility
        var blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, filename);
    }

    function downloadJSON(data, filename) {
        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        downloadBlob(blob, filename);
    }

    function downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function importJSON(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function (e) {
                try { resolve(JSON.parse(e.target.result)); }
                catch (err) { reject(new Error('Invalid JSON file')); }
            };
            reader.onerror = function () { reject(new Error('Failed to read file')); };
            reader.readAsText(file);
        });
    }

    // ── Utilities ─────────────────────────────────────────────
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    function getMonthName(month) {
        return MONTHS[month] || '';
    }

    function getCurrentMonthYear() {
        var now = new Date();
        return { month: now.getMonth(), year: now.getFullYear() };
    }

    function debounce(fn, delay) {
        var timer;
        delay = delay || 300;
        return function () {
            var args = arguments;
            var ctx = this;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
        };
    }

    function getBaseUrl() {
        var loc = window.location;
        return loc.origin + loc.pathname.replace(/\/[^/]*$/, '/');
    }

    // ── Default Data Initialization ───────────────────────────
    async function initializeDefaults() {
        try {
            var settingsDoc = await db.collection('settings').doc('car').get();
            if (!settingsDoc.exists) {
                await db.collection('settings').doc('car').set(DEFAULT_SETTINGS);
            }

            var peopleSnapshot = await db.collection('people').get();
            if (peopleSnapshot.empty) {
                var batch = db.batch();
                DEFAULT_PEOPLE.forEach(function (person) {
                    var ref = db.collection('people').doc(person.id);
                    batch.set(ref, person);
                });
                await batch.commit();
            }
        } catch (error) {
            console.error('Error initializing defaults:', error);
        }
    }

    // ── Backup & Restore ──────────────────────────────────────
    async function backupAll() {
        try {
            var data = { exportedAt: new Date().toISOString(), settings: {}, people: [], trips: [], payments: [] };

            var settingsDoc = await db.collection('settings').doc('car').get();
            if (settingsDoc.exists) data.settings = settingsDoc.data();

            var peopleSnap = await db.collection('people').get();
            peopleSnap.forEach(function (doc) { data.people.push({ id: doc.id, ...doc.data() }); });

            var tripsSnap = await db.collection('trips').get();
            tripsSnap.forEach(function (doc) { data.trips.push({ id: doc.id, ...doc.data() }); });

            var paymentsSnap = await db.collection('payments').get();
            paymentsSnap.forEach(function (doc) { data.payments.push({ id: doc.id, ...doc.data() }); });

            downloadJSON(data, 'carpool-backup-' + formatDateISO() + '.json');
            showToast('Backup exported successfully.', 'success');
        } catch (error) {
            console.error('Backup error:', error);
            showToast('Backup failed.', 'danger');
        }
    }

    async function restoreAll(data) {
        try {
            if (!data || !data.settings) throw new Error('Invalid backup file');

            // Restore settings
            await db.collection('settings').doc('car').set(data.settings);

            // Restore people
            if (data.people && data.people.length > 0) {
                for (var p of data.people) {
                    var pid = p.id;
                    delete p.id;
                    await db.collection('people').doc(pid).set(p);
                }
            }

            // Restore trips
            if (data.trips && data.trips.length > 0) {
                for (var t of data.trips) {
                    var tid = t.id;
                    delete t.id;
                    await db.collection('trips').doc(tid).set(t);
                }
            }

            // Restore payments
            if (data.payments && data.payments.length > 0) {
                for (var pay of data.payments) {
                    var payId = pay.id;
                    delete pay.id;
                    await db.collection('payments').doc(payId).set(pay);
                }
            }

            // Clear caches
            state.settings = null;
            state.people = null;

            showToast('Data restored successfully. Refreshing...', 'success');
            setTimeout(function () { location.reload(); }, 1500);
        } catch (error) {
            console.error('Restore error:', error);
            showToast('Restore failed: ' + error.message, 'danger');
        }
    }

    // ── App Initialization ────────────────────────────────────
    async function init(activePage, pageInitFn, options) {
        options = options || {};

        // Online/offline detection
        setupConnectivityListeners();

        if (options.skipAuth) {
            initNavigation(activePage);
            if (pageInitFn) await pageInitFn();
            return;
        }

        try {
            await signInAnonymously();
            await initializeDefaults();
            await loadSettings();
            await loadPeople();
            initNavigation(activePage);
            state.initialized = true;
            if (pageInitFn) await pageInitFn();
        } catch (error) {
            console.error('App init error:', error);
            showToast('Failed to initialize. Check your Firebase configuration.', 'danger');
            initNavigation(activePage);
            if (pageInitFn) await pageInitFn();
        }
    }

    function setupConnectivityListeners() {
        var banner = document.getElementById('offlineBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'offlineBanner';
            banner.className = 'offline-banner';
            banner.innerHTML = '<i class="bi bi-wifi-off me-1"></i> Internet connection unavailable.';
            document.body.insertBefore(banner, document.body.firstChild);
        }

        window.addEventListener('offline', function () { banner.classList.add('show'); });
        window.addEventListener('online', function () { banner.classList.remove('show'); });
        if (!navigator.onLine) banner.classList.add('show');
    }

    // ── Public API ────────────────────────────────────────────
    window.CarpoolApp = {
        init: init,
        state: state,
        db: db,
        rtdb: rtdb,
        auth: auth,

        // Settings
        getSettings: getSettings, loadSettings: loadSettings, saveSettings: saveSettings,

        // People
        getPeople: getPeople, loadPeople: loadPeople, getActivePeople: getActivePeople,
        getPassengers: getPassengers, getDriver: getDriver,
        savePerson: savePerson, deletePerson: deletePerson,

        // Trips
        getTrips: getTrips, getTrip: getTrip,
        saveTrip: saveTrip, updateTrip: updateTrip, deleteTrip: deleteTrip,

        // Payments
        getPayments: getPayments, savePayment: savePayment, deletePayment: deletePayment,

        // Calculations
        calculateFuelUsed: calculateFuelUsed,
        calculateFuelCost: calculateFuelCost,
        calculateShares: calculateShares,
        getDefaultDistance: getDefaultDistance,

        // Formatting
        formatCurrency: formatCurrency, formatCurrencyShort: formatCurrencyShort,
        formatDate: formatDate, formatDateShort: formatDateShort,
        formatDateISO: formatDateISO, formatTime: formatTime,
        formatDateTime: formatDateTime, timeAgo: timeAgo,

        // Navigation
        initNavigation: initNavigation,

        // Toast
        showToast: showToast,

        // WhatsApp
        openWhatsApp: openWhatsApp, copyToClipboard: copyToClipboard,

        // Export / Import
        exportCSV: exportCSV, downloadJSON: downloadJSON,
        importJSON: importJSON, backupAll: backupAll, restoreAll: restoreAll,

        // Utilities
        generateId: generateId, getMonthName: getMonthName,
        getCurrentMonthYear: getCurrentMonthYear, debounce: debounce,
        getBaseUrl: getBaseUrl, escapeHtml: escapeHtml,

        // Constants
        MONTHS: MONTHS,
        NAV_ITEMS: NAV_ITEMS,
        DEFAULT_SETTINGS: DEFAULT_SETTINGS,
        DEFAULT_PEOPLE: DEFAULT_PEOPLE
    };
})();
