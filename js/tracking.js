// js/tracking.js

window.CarpoolTracker = (function() {
    let state = {
        activeTripId: localStorage.getItem('carpool_active_trip_id') || null,
        watchId: null,
        lastPosition: null,
        lastPushTime: 0
    };

    function generateShareLink(tripId) {
        return window.CarpoolApp.getBaseUrl() + 'track.html?trip=' + tripId;
    }

    function generateShareMessage(tripId, passengerName) {
        const link = generateShareLink(tripId);
        return `Hi ${passengerName}, I've started the trip. You can track my live location here: ${link}`;
    }

    function getDistanceBetween(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    function isTracking() {
        return state.activeTripId !== null;
    }

    function getActiveTripId() {
        return state.activeTripId;
    }

    async function startTrip(passengers) {
        if (!navigator.geolocation) {
            window.CarpoolApp.showToast('Geolocation is not supported by your browser', 'danger');
            return null;
        }

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(async (position) => {
                const settings = window.CarpoolApp.getSettings();
                const tripId = window.CarpoolApp.generateId();
                const now = Date.now();
                const expiryHours = settings.tripExpiryHours || 4;

                const data = {
                    driverId: settings.driverId || 'unknown',
                    driverName: settings.driverName || 'Driver',
                    passengers: passengers,
                    status: 'active',
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: now,
                    startTime: now,
                    expiresAt: now + (expiryHours * 3600000)
                };

                try {
                    await window.CarpoolApp.rtdb.ref('liveTrips/' + tripId).set(data);
                    
                    state.activeTripId = tripId;
                    localStorage.setItem('carpool_active_trip_id', tripId);
                    state.lastPosition = position.coords;
                    state.lastPushTime = now;

                    // Start watching location
                    state.watchId = navigator.geolocation.watchPosition(
                        (newPos) => handlePositionUpdate(newPos, tripId),
                        (error) => handleLocationError(error),
                        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
                    );

                    resolve(tripId);
                } catch (err) {
                    console.error("Error starting trip:", err);
                    window.CarpoolApp.showToast('Failed to start trip. Check connection.', 'danger');
                    reject(err);
                }

            }, (error) => {
                handleLocationError(error);
                reject(error);
            }, { enableHighAccuracy: true, timeout: 10000 });
        });
    }

    function handlePositionUpdate(position, tripId) {
        const coords = position.coords;
        const now = Date.now();

        if (coords.accuracy > 100) {
            console.warn('GPS accuracy is low');
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
            if (dist > 10 || timeDiff > 10000) {
                shouldPush = true;
            }
        }

        if (shouldPush) {
            window.CarpoolApp.rtdb.ref('liveTrips/' + tripId).update({
                lat: coords.latitude,
                lng: coords.longitude,
                accuracy: coords.accuracy,
                timestamp: now
            });
            state.lastPosition = coords;
            state.lastPushTime = now;
        }
    }

    function handleLocationError(error) {
        let msg = "Location error";
        if (error.code === 1) msg = "Location permission denied";
        else if (error.code === 2) msg = "GPS position unavailable";
        else if (error.code === 3) msg = "Location request timed out";
        window.CarpoolApp.showToast(msg, 'danger');
    }

    async function endTrip() {
        if (!state.activeTripId) return;
        const tripId = state.activeTripId;
        
        if (state.watchId !== null) {
            navigator.geolocation.clearWatch(state.watchId);
            state.watchId = null;
        }

        try {
            await window.CarpoolApp.rtdb.ref('liveTrips/' + tripId).update({
                status: 'completed',
                endTime: Date.now()
            });

            // Cleanup after 5 seconds
            setTimeout(() => {
                window.CarpoolApp.rtdb.ref('liveTrips/' + tripId).remove();
            }, 5000);

            state.activeTripId = null;
            localStorage.removeItem('carpool_active_trip_id');
            state.lastPosition = null;
            
            window.CarpoolApp.showToast('Trip ended successfully', 'success');
        } catch (err) {
            console.error("Error ending trip", err);
            window.CarpoolApp.showToast('Error ending trip', 'danger');
        }
    }

    function initPassengerView(tripId, mapElementId) {
        let map = null;
        let marker = null;
        let centered = false;

        const ref = window.CarpoolApp.rtdb.ref('liveTrips/' + tripId);
        
        const listener = ref.on('value', (snapshot) => {
            const data = snapshot.val();
            if (!data) {
                const el = document.getElementById(mapElementId);
                if (el) el.innerHTML = '<div class="alert alert-danger m-3">Trip not found or expired</div>';
                return;
            }

            if (data.status === 'completed') {
                const el = document.getElementById(mapElementId);
                if (el) el.innerHTML = '<div class="alert alert-info m-3">This trip has ended.</div>';
                if (map) map.remove();
                ref.off('value', listener);
                return;
            }

            if (!map) {
                const el = document.getElementById(mapElementId);
                if (!el) return;
                
                map = L.map(mapElementId).setView([data.lat, data.lng], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors'
                }).addTo(map);

                const icon = L.icon({
                    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41]
                });
                
                marker = L.marker([data.lat, data.lng], {icon}).addTo(map)
                    .bindPopup(`${data.driverName}'s Car`).openPopup();
                centered = true;
                
                map.on('dragstart', () => { centered = false; });
            } else {
                marker.setLatLng([data.lat, data.lng]);
                if (centered) {
                    map.setView([data.lat, data.lng]);
                }
            }
            
            // Auto expiry check
            if (Date.now() > data.expiresAt) {
                const el = document.getElementById(mapElementId);
                if (el) el.innerHTML = '<div class="alert alert-warning m-3">Trip expired</div>';
                ref.off('value', listener);
                if (map) map.remove();
            }
        });

        return () => {
            ref.off('value', listener);
            if (map) map.remove();
        };
    }

    return {
        startTrip,
        endTrip,
        getActiveTripId,
        isTracking,
        generateShareLink,
        generateShareMessage,
        getDistanceBetween,
        initPassengerView
    };
})();
