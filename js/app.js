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
        driverDistance: 18,
        tripExpiryHours: 4
    };

    const DEFAULT_PEOPLE = [
        { id: 'vivek', name: 'Vivek', role: 'Driver', distance: 18, pickupDistance: 18, homeLocation: 'Vivek Home', officeLocation: 'Office', pickupLocation: 'Vivek Home', phone: '', active: true },
        { id: 'madhura', name: 'Madhura', role: 'Passenger', distance: 10, pickupDistance: 10, homeLocation: 'Madhura Home', officeLocation: 'Office', pickupLocation: 'Madhura Pickup', phone: '', active: true },
        { id: 'jaydeep', name: 'Jaydeep', role: 'Passenger', distance: 8, pickupDistance: 8, homeLocation: 'Jaydeep Home', officeLocation: 'Office', pickupLocation: 'Jaydeep Pickup', phone: '', active: true },
        { id: 'harsha', name: 'Harsha', role: 'Passenger', distance: 16, pickupDistance: 16, homeLocation: 'Harsha Home', officeLocation: 'Office', pickupLocation: 'Harsha Pickup', phone: '', active: true }
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
            showToast('Authentication failed. Check your Firebase credentials or authorized domains.', 'danger');
            return null;
        }
    }

    // ── Settings CRUD ─────────────────────────────────────────
    async function loadSettings(forceRefresh) {
        if (state.settings && !forceRefresh) return state.settings;
        try {
            const doc = await db.collection('settings').doc('car').get();
            if (doc.exists) {
                state.settings = { ...DEFAULT_SETTINGS, ...doc.data() };
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
        return active.find(p => p.role === 'Driver') || active.find(p => p.id === (state.settings?.driverId || 'vivek')) || null;
    }

    async function savePerson(data) {
        try {
            const id = data.id || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const saveData = {
                ...data,
                distance: parseFloat(data.distance || 0),
                pickupDistance: parseFloat(data.pickupDistance !== undefined ? data.pickupDistance : (data.distance || 0)),
                homeLocation: data.homeLocation || '',
                officeLocation: data.officeLocation || '',
                pickupLocation: data.pickupLocation || '',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            delete saveData.id;
            await db.collection('people').doc(id).set(saveData, { merge: true });
            state.people = null;
            await loadPeople(true);
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
            await loadPeople(true);
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
            const tripData = {
                ...data,
                actualDistance: parseFloat(data.actualDistance || data.finalRouteDistance || 0),
                actualRouteDistance: parseFloat(data.actualRouteDistance || data.actualDistance || 0),
                finalRouteDistance: parseFloat(data.finalRouteDistance || data.actualDistance || 0),
                distanceSource: data.distanceSource || 'manual',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
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
            const tripData = {
                ...data,
                actualDistance: parseFloat(data.actualDistance || data.finalRouteDistance || 0),
                actualRouteDistance: parseFloat(data.actualRouteDistance || data.actualDistance || 0),
                finalRouteDistance: parseFloat(data.finalRouteDistance || data.actualDistance || 0),
                distanceSource: data.distanceSource || 'manual',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            delete tripData.id;
            await db.collection('trips').doc(id).update(tripData);
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
    function getLocalPayments() {
        try {
            return JSON.parse(localStorage.getItem('carpool_local_payments') || '[]');
        } catch (e) {
            return [];
        }
    }

    function saveLocalPayment(payment) {
        try {
            const list = getLocalPayments().filter(p => p.id !== payment.id);
            list.push(payment);
            localStorage.setItem('carpool_local_payments', JSON.stringify(list));
        } catch (e) {
            console.error('Error saving local payment:', e);
        }
    }

    function deleteLocalPayment(id) {
        try {
            const list = getLocalPayments().filter(p => p.id !== id);
            localStorage.setItem('carpool_local_payments', JSON.stringify(list));
        } catch (e) {
            console.error('Error deleting local payment:', e);
        }
    }

    async function getPayments(filters) {
        filters = filters || {};
        let payments = [];
        let fetchedFromDb = false;

        try {
            let query = db.collection('payments');
            if (filters.personId) query = query.where('personId', '==', filters.personId);
            if (filters.month !== undefined && filters.year !== undefined) {
                query = query.where('month', '==', filters.month).where('year', '==', filters.year);
            }
            const snapshot = await query.get();
            snapshot.forEach(doc => payments.push({ id: doc.id, ...doc.data() }));
            fetchedFromDb = true;
        } catch (error) {
            console.warn('Could not fetch payments from Firestore, falling back to local cache:', error);
        }

        // Merge with local payments
        const localList = getLocalPayments();
        localList.forEach(lp => {
            if (!payments.find(p => p.id === lp.id)) {
                let match = true;
                if (filters.personId && lp.personId !== filters.personId) match = false;
                if (filters.month !== undefined && lp.month !== filters.month) match = false;
                if (filters.year !== undefined && lp.year !== filters.year) match = false;
                if (match) payments.push(lp);
            }
        });

        return payments;
    }

    async function savePayment(data) {
        const id = data.id || generateId();
        const paymentData = { 
            ...data, 
            id: id,
            createdAt: new Date().toISOString() 
        };

        // Always save to local storage immediately
        saveLocalPayment(paymentData);

        try {
            const firestoreData = { ...paymentData, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
            delete firestoreData.id;
            await db.collection('payments').doc(id).set(firestoreData, { merge: true });
            showToast('Payment recorded successfully.', 'success');
            return id;
        } catch (error) {
            console.warn('Firestore payment save failed, stored locally:', error);
            showToast('Payment recorded locally.', 'success');
            return id;
        }
    }

    async function deletePayment(id) {
        deleteLocalPayment(id);
        try {
            await db.collection('payments').doc(id).delete();
            showToast('Payment deleted.', 'success');
            return true;
        } catch (error) {
            console.warn('Firestore delete failed, removed locally:', error);
            showToast('Payment deleted.', 'success');
            return true;
        }
    }

    // ============================================================
    // ── Centralized Calculation Engine ──────────────────────────
    // ============================================================

    /**
     * Calculate fuel used in litres: Distance / Mileage
     */
    function calculateFuelUsed(distance, mileage) {
        if (!mileage || mileage <= 0 || !distance || distance <= 0) return 0;
        return parseFloat((distance / mileage).toFixed(2));
    }

    /**
     * Calculate Total Trip Cost strictly based on Actual Trip Distance × Cost per KM.
     * Formula: Total Trip Cost = (Actual Trip Distance / Mileage) × Petrol Price
     * Example: 18 km with 12 km/l @ ₹120/l (₹10/km) = ₹180.00
     */
    function calculateTotalTripCost(actualTripDistance, mileage, petrolPrice) {
        if (!actualTripDistance || actualTripDistance <= 0) return 0;
        mileage = mileage || (getSettings().mileage || 12);
        petrolPrice = petrolPrice || (getSettings().petrolPrice || 105);
        var fuel = calculateFuelUsed(actualTripDistance, mileage);
        return parseFloat((fuel * petrolPrice).toFixed(2));
    }

    function calculateFuelCost(distance, mileage, petrolPrice) {
        return calculateTotalTripCost(distance, mileage, petrolPrice);
    }

    /**
     * Calculate the rate per kilometer based on petrol price and mileage: Petrol Price / Mileage
     * Example: ₹120 / 12 km/l = ₹10.00 per km
     */
    function calculateRatePerKm(petrolPrice, mileage) {
        if (!mileage || mileage <= 0 || !petrolPrice || petrolPrice <= 0) return 0;
        return parseFloat((petrolPrice / mileage).toFixed(2));
    }

    /**
     * Calculate passenger-specific distance object.
     * Checks if manual distance is provided; otherwise uses pickup distance or home-to-office distance.
     * @param {Object|string} passenger - Passenger object or ID
     * @param {Object} options - { manualDistance, tripType, pickupDistance }
     * @returns {Object} { passengerId, passengerName, calculatedDistance, manualDistance, finalDistance, distanceSource }
     */
    function calculatePassengerDistance(passenger, options) {
        options = options || {};
        let pObj = typeof passenger === 'string' ? (getPeople().find(p => p.id === passenger) || { id: passenger, name: passenger, distance: 0 }) : passenger;
        
        const baseDistance = parseFloat(pObj.pickupDistance !== undefined ? pObj.pickupDistance : (pObj.distance || 0));
        let multiplier = 1;
        if (options.tripType === 'Full Day') multiplier = 2;
        else if (options.tripType === 'Custom' && options.multiplier) multiplier = options.multiplier;

        const calculatedDistance = parseFloat((baseDistance * multiplier).toFixed(1));
        
        let manualDistance = null;
        let finalDistance = calculatedDistance;
        let distanceSource = 'calculated';

        if (options.manualDistance !== undefined && options.manualDistance !== null && options.manualDistance !== '' && !isNaN(parseFloat(options.manualDistance))) {
            manualDistance = parseFloat(parseFloat(options.manualDistance).toFixed(1));
            finalDistance = manualDistance;
            distanceSource = 'manual';
        }

        return {
            passengerId: pObj.id,
            passengerName: pObj.name,
            pickupLocation: pObj.pickupLocation || pObj.homeLocation || `${pObj.name} Pickup`,
            calculatedDistance: calculatedDistance,
            manualDistance: manualDistance,
            finalDistance: finalDistance,
            distanceSource: distanceSource
        };
    }

    /**
     * Calculate passenger-specific chargeable distance based on route and trip parameters.
     */
    function calculateChargeableDistance(passengerDistanceInfo, tripType) {
        if (!passengerDistanceInfo) return 0;
        return parseFloat((passengerDistanceInfo.finalDistance || passengerDistanceInfo.distance || 0).toFixed(1));
    }

    /**
     * Calculate route distance for the vehicle.
     * Distinguishes between driver home-to-office, multi-stop pickup route, and manual overrides.
     * @param {string} tripType - Office | Return | Full Day | Custom
     * @param {number} driverDistance - Driver's base distance
     * @param {Array} passengerDistances - Optional list of passenger distance objects
     * @param {Object} options - { manualRouteDistance }
     */
    function calculateRouteDistance(tripType, driverDistance, passengerDistances, options) {
        options = options || {};
        if (options.manualRouteDistance !== undefined && options.manualRouteDistance !== null && !isNaN(parseFloat(options.manualRouteDistance))) {
            return parseFloat(parseFloat(options.manualRouteDistance).toFixed(1));
        }

        driverDistance = parseFloat(driverDistance || getDriver()?.distance || 17);
        return getDefaultDistance(tripType, driverDistance);
    }

    /**
     * Calculate individual person contribution from person distance, total person distance, and total trip cost.
     * Formula: (personDistance / totalPersonDistance) * totalTripCost
     */
    function calculatePersonContribution(personDistance, totalPersonDistance, totalTripCost) {
        if (!totalPersonDistance || totalPersonDistance <= 0 || !totalTripCost || totalTripCost <= 0) return 0;
        return parseFloat(((personDistance / totalPersonDistance) * totalTripCost).toFixed(2));
    }

    /**
     * Calculate Complete Distance-Based Cost Sharing.
     * 
     * Principles:
     * 1. Total Trip Cost = Actual Car Trip Distance × Cost Per KM (No markup/profit)
     * 2. Total Person Distance = Driver Distance + Sum of Passengers' Applicable Distances
     * 3. Driver Contribution = (Driver Distance / Total Person Distance) × Total Trip Cost
     * 4. Passenger Contribution = (Passenger Distance / Total Person Distance) × Total Trip Cost
     * 5. Friends' Contribution = Sum of Passenger Contributions
     * 6. Driver Profit === ₹0.00
     * 7. Exact penny rounding reconciliation: Sum(All Contributions) === Total Trip Cost
     *
     * @param {number} actualTripDistance - Car route distance (km)
     * @param {Array} passengerList - List of passenger IDs or passenger objects
     * @param {Object} options - { driverDistance, passengerDistances, mileage, petrolPrice }
     * @returns {Object} Complete calculation breakdown
     */
    function calculateTripContributions(actualTripDistance, passengerList, options) {
        options = options || {};
        const settings = getSettings();
        const mileage = parseFloat(options.mileage || settings.mileage || 12);
        const petrolPrice = parseFloat(options.petrolPrice || settings.petrolPrice || 105);
        const ratePerKm = calculateRatePerKm(petrolPrice, mileage);

        const actualDist = parseFloat(parseFloat(actualTripDistance || 0).toFixed(1));
        const totalCost = calculateTotalTripCost(actualDist, mileage, petrolPrice);

        const driver = getDriver();
        const driverId = driver ? driver.id : (settings.driverId || 'vivek');
        const driverName = driver ? driver.name : (settings.driverName || 'Vivek');
        const driverDist = parseFloat(options.driverDistance !== undefined ? options.driverDistance : (driver ? (driver.pickupDistance || driver.distance || 18) : (settings.driverDistance || 18)));

        const passengers = passengerList || [];
        const passengerDistances = {};
        const passengerContributions = {};

        let sumPassengerDistances = 0;

        passengers.forEach(p => {
            const pid = typeof p === 'object' ? (p.id || p.name) : p;
            let pDist = 0;

            if (options.passengerDistances && options.passengerDistances[pid] !== undefined) {
                pDist = parseFloat(options.passengerDistances[pid]) || 0;
            } else if (typeof p === 'object' && (p.finalDistance !== undefined || p.chargeableDistance !== undefined || p.distance !== undefined)) {
                pDist = parseFloat(p.finalDistance !== undefined ? p.finalDistance : (p.chargeableDistance !== undefined ? p.chargeableDistance : p.distance)) || 0;
            } else {
                const pObj = getPeople().find(x => x.id === pid || x.name === pid);
                pDist = pObj ? parseFloat(pObj.pickupDistance !== undefined ? pObj.pickupDistance : (pObj.distance || 0)) : 0;
            }

            passengerDistances[pid] = pDist;
            sumPassengerDistances += pDist;
        });

        const totalPersonDistance = parseFloat((driverDist + sumPassengerDistances).toFixed(2));

        if (totalCost <= 0 || (totalPersonDistance <= 0 && passengers.length === 0)) {
            return {
                actualTripDistance: actualDist,
                ratePerKm: ratePerKm,
                fuelUsed: calculateFuelUsed(actualDist, mileage),
                totalTripCost: 0,
                costPerKm: ratePerKm,
                driverId: driverId,
                driverName: driverName,
                driverDistance: driverDist,
                driverContribution: 0,
                passengerDistances: passengerDistances,
                passengerContributions: passengerContributions,
                friendsContribution: 0,
                totalContribution: 0,
                driverProfit: 0,
                totalPersonDistance: totalPersonDistance
            };
        }

        let runningSum = 0;
        let maxDist = driverDist;
        let maxPerson = { type: 'driver', id: driverId };

        // 1. Calculate Driver Share
        let rawDriverShare = totalPersonDistance > 0 ? (totalCost * driverDist) / totalPersonDistance : (totalCost / (1 + passengers.length));
        let driverContribution = parseFloat(rawDriverShare.toFixed(2));
        runningSum += driverContribution;

        // 2. Calculate Passengers' Shares
        let friendsContribution = 0;
        passengers.forEach(p => {
            const pid = typeof p === 'object' ? (p.id || p.name) : p;
            const pDist = passengerDistances[pid] || 0;
            let rawShare = totalPersonDistance > 0 ? (totalCost * pDist) / totalPersonDistance : (totalCost / (1 + passengers.length));
            let pContribution = parseFloat(rawShare.toFixed(2));

            passengerContributions[pid] = pContribution;
            runningSum += pContribution;
            friendsContribution += pContribution;

            if (pDist > maxDist) {
                maxDist = pDist;
                maxPerson = { type: 'passenger', id: pid };
            }
        });

        // 3. Exact Rounding Reconciliation
        const diff = parseFloat((totalCost - runningSum).toFixed(2));
        if (diff !== 0) {
            if (maxPerson.type === 'driver') {
                driverContribution = parseFloat((driverContribution + diff).toFixed(2));
            } else if (passengerContributions[maxPerson.id] !== undefined) {
                passengerContributions[maxPerson.id] = parseFloat((passengerContributions[maxPerson.id] + diff).toFixed(2));
                friendsContribution = parseFloat((friendsContribution + diff).toFixed(2));
            }
        }

        friendsContribution = parseFloat(friendsContribution.toFixed(2));

        return {
            actualTripDistance: actualDist,
            ratePerKm: ratePerKm,
            costPerKm: ratePerKm,
            fuelUsed: calculateFuelUsed(actualDist, mileage),
            totalTripCost: totalCost,
            driverId: driverId,
            driverName: driverName,
            driverDistance: driverDist,
            driverContribution: driverContribution,
            passengerDistances: passengerDistances,
            passengerContributions: passengerContributions,
            friendsContribution: friendsContribution,
            totalContribution: totalCost,
            driverProfit: 0,
            totalPersonDistance: totalPersonDistance
        };
    }

    /**
     * Calculate passenger shares using the unified distance-based cost-sharing model.
     * Backwards-compatible wrapper returning passenger shares object { [id]: amount }.
     */
    function calculateShares(totalTripCost, passengers, mode, customData, meta) {
        var shares = {};
        if (!passengers || passengers.length === 0) return shares;

        customData = customData || {};
        meta = meta || {};
        const settings = getSettings();
        const mileage = meta.mileage || settings.mileage || 12;
        const petrolPrice = meta.petrolPrice || settings.petrolPrice || 105;
        const ratePerKm = calculateRatePerKm(petrolPrice, mileage);

        let actualDist = meta.actualDistance;
        if (actualDist === undefined || actualDist === null || isNaN(parseFloat(actualDist))) {
            actualDist = ratePerKm > 0 ? (totalTripCost / ratePerKm) : (settings.driverDistance || 18);
        }

        const driverDist = meta.driverDistance !== undefined ? meta.driverDistance : (settings.driverDistance || 18);

        const result = calculateTripContributions(actualDist, passengers, {
            mileage: mileage,
            petrolPrice: petrolPrice,
            driverDistance: driverDist,
            passengerDistances: customData.passengerDistances
        });

        return result.passengerContributions;
    }

    /**
     * Get the default total distance for a trip based on type.
     * @param {string} tripType - Office | Return | Full Day | Custom
     * @param {number} driverDistance - Driver's one-way distance
     * @returns {number} Default total distance
     */
    function getDefaultDistance(tripType, driverDistance) {
        const d = parseFloat(driverDistance || getDriver()?.distance || 17);
        switch (tripType) {
            case 'Office': return d;           // one way
            case 'Return': return d;           // one way (return leg)
            case 'Full Day': return parseFloat((d * 2).toFixed(1)); // round trip
            case 'Custom': return 0;
            default: return d;
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
        if (seconds < 60) return seconds + 's ago';
        var minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + 'm ago';
        var hours = Math.floor(minutes / 60);
        return hours + 'h ago';
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
            '<div class="brand-icon"><i class="bi bi-car-front-fill"></i></div>' +
            '<div class="brand-text">' +
            '<span class="brand-title">MAHLE</span>' +
            '<span class="brand-subtitle">RideMate</span>' +
            '</div></div>' +
            '<nav class="sidebar-nav">' + navLinks + '</nav>' +
            '<div class="sidebar-footer">' +
            '<small class="text-white-50" style="font-size:0.75rem;"><i class="bi bi-shield-check me-1 text-success"></i> MAHLE RideMate v2.5</small></div>';
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
            '<div class="d-flex align-items-center gap-3">' +
            '<div class="d-md-none brand-icon" style="width:34px;height:34px;font-size:1.1rem;"><i class="bi bi-car-front-fill"></i></div>' +
            '<div><h6 class="mb-0 fw-bold d-md-none text-primary">' + (pageTitle === 'Dashboard' ? 'MAHLE RideMate' : pageTitle) + '</h6>' +
            '<div class="d-none d-md-flex align-items-center gap-2">' +
            '<span class="badge bg-primary-subtle text-primary border px-3 py-2 rounded-pill fw-bold"><i class="bi bi-calendar3 me-1"></i> ' + monthYear + '</span>' +
            '<span class="badge bg-light text-secondary border px-3 py-2 rounded-pill fw-medium">Zero-Profit Friend Carpool</span>' +
            '</div></div></div>' +
            '<div class="d-flex align-items-center gap-2">' +
            '<span id="topbarLiveIndicator" class="live-badge d-none">' +
            '<span class="live-dot"></span> LIVE</span>' +
            '<div class="d-flex align-items-center gap-2 px-3 py-1 bg-light border rounded-pill">' +
            '<i class="bi bi-person-circle text-primary fs-5"></i>' +
            '<span class="fw-bold small text-dark">' + driverName + '</span>' +
            '<span class="badge bg-primary text-white rounded-pill" style="font-size:0.65rem;">Driver</span>' +
            '</div></div></div>';
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
        div.appendChild(document.createTextNode(str || ''));
        return div.innerHTML;
    }

    // ── WhatsApp Deep Link Helper ─────────────────────────────
    function openWhatsApp(phone, message) {
        var cleanPhone = (phone || '').toString().replace(/[^0-9]/g, '');
        // Auto-fix 10-digit Indian numbers without country code (e.g. 9876543210 -> 919876543210)
        if (cleanPhone.length === 10 && /^[6-9]/.test(cleanPhone)) {
            cleanPhone = '91' + cleanPhone;
        } else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
            cleanPhone = '91' + cleanPhone.substring(1);
        }

        var encoded = encodeURIComponent(message || '');
        var url = cleanPhone
            ? 'https://api.whatsapp.com/send?phone=' + cleanPhone + '&text=' + encoded
            : 'https://api.whatsapp.com/send?text=' + encoded;

        try {
            var win = window.open(url, '_blank');
            if (!win || win.closed || typeof win.closed === 'undefined') {
                var a = document.createElement('a');
                a.href = url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        } catch (e) {
            window.location.href = url;
        }
        showToast('Opening WhatsApp...', 'success');
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Message Copied to clipboard!', 'success');
        } catch (e) {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('Message Copied to clipboard!', 'success');
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

            await db.collection('settings').doc('car').set(data.settings);

            if (data.people && data.people.length > 0) {
                for (var p of data.people) {
                    var pid = p.id;
                    delete p.id;
                    await db.collection('people').doc(pid).set(p);
                }
            }

            if (data.trips && data.trips.length > 0) {
                for (var t of data.trips) {
                    var tid = t.id;
                    delete t.id;
                    await db.collection('trips').doc(tid).set(t);
                }
            }

            if (data.payments && data.payments.length > 0) {
                for (var pay of data.payments) {
                    var payId = pay.id;
                    delete pay.id;
                    await db.collection('payments').doc(payId).set(pay);
                }
            }

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

        // Calculation Engine
        calculateFuelUsed: calculateFuelUsed,
        calculateFuelCost: calculateFuelCost,
        calculateTripCost: calculateTotalTripCost,
        calculateTotalTripCost: calculateTotalTripCost,
        calculateRatePerKm: calculateRatePerKm,
        calculatePassengerDistance: calculatePassengerDistance,
        calculateChargeableDistance: calculateChargeableDistance,
        calculateRouteDistance: calculateRouteDistance,
        calculateTripContributions: calculateTripContributions,
        calculatePersonContribution: calculatePersonContribution,
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
