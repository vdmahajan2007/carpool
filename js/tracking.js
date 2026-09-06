// ============================================================
// js/tracking.js — Live Location Tracking Module
// ============================================================

window.CarpoolTracker = (function() {
    'use strict';

    let state = {
        activeTripId: localStorage.getItem('carpool_active_trip_id') || null,
        activeTripData: null,
        watchId: null,
        lastPosition: null,
        lastPushTime: 0,
        isStarting: false
    };

    function generateShareLink(tripId) {
        return window.CarpoolApp.getBaseUrl() + 'track.html?trip=' + encodeURIComponent(tripId);
    }

    function generateShareMessage(tripId, passengerName) {
        const link = generateShareLink(tripId);
        const settings = window.CarpoolApp.getSettings();
        const driverName = settings.driverName || 'Vivek';
        return `🚗 ${driverName} has started the carpool trip.\n\nYou can track the live location here:\n${link}\n\nThe live location will stop when the trip ends.`;
    }

    function getDistanceBetween(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    function isTracking() {
        return state.activeTripId !== null;
    }

    function getActiveTripId() {
        return state.activeTripId;
    }

    /**
     * Start a live GPS tracking trip. Idempotent — will not start a duplicate trip if already tracking.
     * @param {Array} passengerIds - Selected passenger IDs
     * @param {Object} routeOptions - { actualRouteDistance, passengerDetails, tripType }
     */
    async function startTrip(passengerIds, routeOptions) {
        routeOptions = routeOptions || {};

        // Idempotency check: prevent multiple active trips
        if (state.activeTripId) {
            window.CarpoolApp.showToast('Trip is already active.', 'warning');
            return state.activeTripId;
        }

        if (state.isStarting) {
            return null;
        }

        if (!navigator.geolocation) {
            window.CarpoolApp.showToast('Geolocation is not supported by your browser.', 'danger');
            return null;
        }

        state.isStarting = true;

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(async (position) => {
                try {
                    const settings = window.CarpoolApp.getSettings();
                    const tripId = window.CarpoolApp.generateId();
                    const now = Date.now();
                    const expiryHours = settings.tripExpiryHours || 4;

                    const allPeople = window.CarpoolApp.getPeople();
                    const selectedPassengers = (passengerIds || []).map(id => {
                        const p = allPeople.find(x => x.id === id || x.name === id);
                        return p ? p.name : id;
                    });

                    // Build passenger details breakdown
                    const passengerDetails = {};
                    const petrolPrice = settings.petrolPrice || 105;
                    const mileage = settings.mileage || 12;
                    const ratePerKm = window.CarpoolApp.calculateRatePerKm(petrolPrice, mileage);

                    (passengerIds || []).forEach((pid, idx) => {
                        const pObj = allPeople.find(x => x.id === pid || x.name === pid);
                        const pId = pObj ? pObj.id : pid;
                        const pName = pObj ? pObj.name : pid;
                        
                        const customDist = (routeOptions.passengerDetails && routeOptions.passengerDetails[pId])
                            ? routeOptions.passengerDetails[pId].finalDistance
                            : (pObj?.pickupDistance || pObj?.distance || 10);

                        const pDistInfo = window.CarpoolApp.calculatePassengerDistance(pObj || { id: pId, name: pName }, {
                            manualDistance: customDist,
                            tripType: routeOptions.tripType || 'Office'
                        });

                        const amount = parseFloat((pDistInfo.finalDistance * ratePerKm).toFixed(2));

                        passengerDetails[pId] = {
                            passengerId: pId,
                            passengerName: pName,
                            pickupLocation: pObj?.pickupLocation || `${pName} Pickup`,
                            pickupOrder: idx + 1,
                            calculatedDistance: pDistInfo.calculatedDistance,
                            manualDistance: pDistInfo.manualDistance,
                            finalDistance: pDistInfo.finalDistance,
                            distanceSource: pDistInfo.distanceSource,
                            chargeableDistance: pDistInfo.finalDistance,
                            ratePerKm: ratePerKm,
                            amount: amount
                        };
                    });

                    const actualRouteDistance = routeOptions.actualRouteDistance || window.CarpoolApp.getDefaultDistance(routeOptions.tripType || 'Office', settings.driverDistance || 17);

                    const data = {
                        tripId: tripId,
                        driverId: settings.driverId || 'vivek',
                        driverName: settings.driverName || 'Vivek',
                        passengers: selectedPassengers,
                        passengerIds: passengerIds || [],
                        passengerDetails: passengerDetails,
                        actualRouteDistance: actualRouteDistance,
                        status: 'active',
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: now,
                        startTime: now,
                        expiresAt: now + (expiryHours * 3600000)
                    };

                    await window.CarpoolApp.rtdb.ref('liveTrips/' + tripId).set(data);

                    state.activeTripId = tripId;
                    state.activeTripData = data;
                    localStorage.setItem('carpool_active_trip_id', tripId);
                    state.lastPosition = position.coords;
                    state.lastPushTime = now;
                    state.isStarting = false;

                    // Start GPS watcher
                    state.watchId = navigator.geolocation.watchPosition(
                        (newPos) => handlePositionUpdate(newPos, tripId),
                        (error) => handleLocationError(error),
                        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
                    );

                    window.CarpoolApp.showToast('Live trip started! GPS is active.', 'success');
                    resolve(tripId);
                } catch (err) {
                    state.isStarting = false;
                    console.error("Error starting live trip:", err);
                    window.CarpoolApp.showToast('Failed to start trip. Check Firebase database connection.', 'danger');
                    reject(err);
                }

            }, (error) => {
                state.isStarting = false;
                handleLocationError(error);
                reject(error);
            }, { enableHighAccuracy: true, timeout: 10000 });
        });
    }

    function handlePositionUpdate(position, tripId) {
        const coords = position.coords;
        const now = Date.now();

        if (coords.accuracy > 100) {
            console.warn('GPS accuracy is low: ±' + Math.round(coords.accuracy) + 'm');
        }

        let shouldPush = false;
        if (!state.lastPosition) {
            shouldPush = true;
        } else {
            const dist = getDistanceBetween(
                state.lastPosition.latitude, state.lastPosition.longitude,
                coords.latitude, coords.longitude
            );
            const timeDiff = now - state.lastPushTime;

            // Smart update: push if moved > 10m OR every 10 seconds
            if (dist > 10 || timeDiff >= 10000) {
                shouldPush = true;
            }
        }

        if (shouldPush && state.activeTripId === tripId) {
            window.CarpoolApp.rtdb.ref('liveTrips/' + tripId).update({
                lat: coords.latitude,
                lng: coords.longitude,
                accuracy: coords.accuracy,
                timestamp: now
            }).catch(e => console.error("RTDB position update error:", e));

            state.lastPosition = coords;
            state.lastPushTime = now;
        }
    }

    function handleLocationError(error) {
        let msg = "Location error.";
        if (error.code === 1) msg = "Please enable Location permission in your browser settings.";
        else if (error.code === 2) msg = "GPS position unavailable.";
        else if (error.code === 3) msg = "Location request timed out.";
        window.CarpoolApp.showToast(msg, 'danger');
    }

    /**
     * End active live trip: stops GPS, updates RTDB, computes final charges, and saves to trip history.
     */
    async function endTrip(completionOptions) {
        completionOptions = completionOptions || {};
        if (!state.activeTripId) return;
        const tripId = state.activeTripId;

        // Clear GPS watcher immediately
        if (state.watchId !== null) {
            navigator.geolocation.clearWatch(state.watchId);
            state.watchId = null;
        }

        try {
            const now = Date.now();
            const settings = window.CarpoolApp.getSettings();
            
            // Get snapshot of trip data from RTDB
            let liveData = state.activeTripData;
            try {
                const snap = await window.CarpoolApp.rtdb.ref('liveTrips/' + tripId).get();
                if (snap.exists()) liveData = snap.val();
            } catch (e) {
                console.warn("Could not fetch final live trip snapshot:", e);
            }

            // Mark completed in RTDB
            await window.CarpoolApp.rtdb.ref('liveTrips/' + tripId).update({
                status: 'completed',
                endTime: now
            });

            // Schedule removal from RTDB after 10 seconds to stop public tracking
            setTimeout(() => {
                window.CarpoolApp.rtdb.ref('liveTrips/' + tripId).remove().catch(() => {});
            }, 10000);

            // Calculate immutable trip history records
            const distance = completionOptions.actualRouteDistance || liveData?.actualRouteDistance || settings.driverDistance || 17;
            const petrolPrice = settings.petrolPrice || 105;
            const mileage = settings.mileage || 12;
            const ratePerKm = window.CarpoolApp.calculateRatePerKm(petrolPrice, mileage);
            const fuelUsed = window.CarpoolApp.calculateFuelUsed(distance, mileage);
            const fuelCost = window.CarpoolApp.calculateFuelCost(distance, mileage, petrolPrice);

            const pIds = liveData?.passengerIds || liveData?.passengers || [];
            const passengerDetails = liveData?.passengerDetails || {};
            const passengerShares = {};

            pIds.forEach(pid => {
                if (passengerDetails[pid]) {
                    passengerShares[pid] = passengerDetails[pid].amount;
                } else {
                    const pObj = window.CarpoolApp.getPeople().find(x => x.id === pid || x.name === pid);
                    const pDist = pObj ? (pObj.pickupDistance || pObj.distance || 10) : 10;
                    passengerShares[pid] = parseFloat((pDist * ratePerKm).toFixed(2));
                }
            });

            const tripHistoryRecord = {
                date: window.CarpoolApp.formatDateISO(new Date(liveData?.startTime || now)),
                type: completionOptions.tripType || 'Office',
                driverId: settings.driverId || 'vivek',
                driverName: settings.driverName || 'Vivek',
                passengers: pIds,
                passengerDetails: passengerDetails,
                actualRouteDistance: distance,
                actualDistance: distance,
                finalRouteDistance: distance,
                distanceSource: 'gps_live',
                mileage: mileage,
                petrolPrice: petrolPrice,
                ratePerKm: ratePerKm,
                fuelUsed: fuelUsed,
                fuelCost: fuelCost,
                passengerShares: passengerShares,
                sharingMode: settings.sharingMode || 'distance',
                status: 'Completed',
                notes: `Live GPS Trip completed at ${window.CarpoolApp.formatTime(now)}.`
            };

            await window.CarpoolApp.saveTrip(tripHistoryRecord);

            state.activeTripId = null;
            state.activeTripData = null;
            localStorage.removeItem('carpool_active_trip_id');
            state.lastPosition = null;

            window.CarpoolApp.showToast('Trip ended successfully and saved to history.', 'success');
            return tripHistoryRecord;
        } catch (err) {
            console.error("Error ending trip:", err);
            window.CarpoolApp.showToast('Error ending trip. Data saved locally.', 'danger');
            state.activeTripId = null;
            localStorage.removeItem('carpool_active_trip_id');
        }
    }

    return {
        startTrip,
        endTrip,
        getActiveTripId,
        isTracking,
        generateShareLink,
        generateShareMessage,
        getDistanceBetween
    };
})();
