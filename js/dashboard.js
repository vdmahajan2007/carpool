// ============================================================
// js/dashboard.js — Main Dashboard Logic
// ============================================================

let mapInstance = null;
let mapMarker = null;
let activeTripListenerCleanup = null;
let startTripModalInstance = null;
let endTripModalInstance = null;

CarpoolApp.init('dashboard', async function() {
    startTripModalInstance = new bootstrap.Modal(document.getElementById('startTripModal'));
    endTripModalInstance = new bootstrap.Modal(document.getElementById('endTripModal'));

    await renderStatCards();
    renderCurrentTripSection();
    renderQuickTripEntry();
    renderDebugPanel();

    // Auto-refresh stats and live tracking state periodically
    setInterval(() => {
        if (window.CarpoolTracker.isTracking()) {
            updateLiveTripUI();
        }
    }, 10000);
});

async function renderStatCards() {
    const { month, year } = window.CarpoolApp.getCurrentMonthYear();
    const trips = await window.CarpoolApp.getTrips({ month, year }) || [];
    const passengers = window.CarpoolApp.getPassengers() || [];
    const settings = window.CarpoolApp.getSettings();
    
    let totalTrips = trips.length;
    let totalKm = 0;
    let totalFuelUsed = 0;
    let totalFuelCost = 0;
    
    let passengerShares = {};
    passengers.forEach(p => passengerShares[p.id] = 0);
    
    trips.forEach(t => {
        totalKm += parseFloat(t.actualDistance || t.actualRouteDistance || 0);
        totalFuelUsed += parseFloat(t.fuelUsed || 0);
        totalFuelCost += parseFloat(t.fuelCost || 0);
        
        if (t.passengerShares) {
            for (let pid in t.passengerShares) {
                if (passengerShares[pid] !== undefined) {
                    passengerShares[pid] += parseFloat(t.passengerShares[pid] || 0);
                }
            }
        }
    });

    let statCardsHtml = `
        <div class="col-6 col-md-4 col-lg-2">
            <div class="stat-card">
                <div class="stat-icon bg-blue"><i class="bi bi-car-front-fill"></i></div>
                <div class="stat-label">Total Trips</div>
                <div class="stat-value" id="statTotalTrips">${totalTrips}</div>
                <div class="stat-sub">This month</div>
            </div>
        </div>
        <div class="col-6 col-md-4 col-lg-2">
            <div class="stat-card">
                <div class="stat-icon bg-teal"><i class="bi bi-geo-alt-fill"></i></div>
                <div class="stat-label">Total KM</div>
                <div class="stat-value">${totalKm.toFixed(1)}</div>
                <div class="stat-sub">Car distance</div>
            </div>
        </div>
        <div class="col-6 col-md-4 col-lg-2">
            <div class="stat-card">
                <div class="stat-icon bg-orange"><i class="bi bi-fuel-pump-fill"></i></div>
                <div class="stat-label">Fuel Used</div>
                <div class="stat-value">${totalFuelUsed.toFixed(1)} L</div>
                <div class="stat-sub">@ ${settings.mileage || 12} km/l</div>
            </div>
        </div>
        <div class="col-6 col-md-4 col-lg-2">
            <div class="stat-card">
                <div class="stat-icon bg-green"><i class="bi bi-currency-rupee"></i></div>
                <div class="stat-label">Fuel Cost</div>
                <div class="stat-value">${window.CarpoolApp.formatCurrencyShort(totalFuelCost)}</div>
                <div class="stat-sub">@ ₹${settings.petrolPrice || 105}/L</div>
            </div>
        </div>
    `;

    // Dynamic passenger due cards for active passengers
    const activePax = passengers.filter(p => p.active !== false);
    const colors = ['bg-purple', 'bg-pink', 'bg-cyan', 'bg-orange'];

    activePax.forEach((p, index) => {
        const colorClass = colors[index % colors.length];
        const amount = passengerShares[p.id] || 0;
        statCardsHtml += `
            <div class="col-6 col-md-4 col-lg-2">
                <div class="stat-card">
                    <div class="stat-icon ${colorClass}"><i class="bi bi-person-fill"></i></div>
                    <div class="stat-label text-truncate" style="max-width: 100%;">${window.CarpoolApp.escapeHtml(p.name)} Due</div>
                    <div class="stat-value">${window.CarpoolApp.formatCurrency(amount)}</div>
                    <div class="stat-sub">${p.pickupDistance || p.distance || 0}km default</div>
                </div>
            </div>
        `;
    });
    
    document.getElementById('statCards').innerHTML = statCardsHtml;
}

function renderCurrentTripSection() {
    const container = document.getElementById('currentTripSection');
    const isTracking = window.CarpoolTracker.isTracking();
    const tripId = window.CarpoolTracker.getActiveTripId();

    if (!isTracking) {
        if (activeTripListenerCleanup) {
            activeTripListenerCleanup();
            activeTripListenerCleanup = null;
        }
        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
            mapMarker = null;
        }
        container.innerHTML = `
            <button class="btn-start-trip" id="btnStartTrip">
                <i class="bi bi-broadcast me-2"></i> START LIVE TRIP
            </button>
        `;
        document.getElementById('btnStartTrip').addEventListener('click', showStartTripModal);
    } else {
        if (!document.getElementById('activeTripCard')) {
            container.innerHTML = `
                <div class="card shadow-sm border-0 rounded-4" id="activeTripCard">
                    <div class="card-body p-4">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="card-title mb-0 d-flex align-items-center fw-bold">
                                <span class="spinner-grow spinner-grow-sm text-danger me-2" role="status"></span>
                                Live Trip in Progress
                            </h5>
                            <span class="live-badge"><span class="live-dot"></span> LIVE</span>
                        </div>
                        
                        <div class="bg-light rounded-3 p-3 mb-3">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <span class="text-muted small">Passengers in Trip:</span>
                                <div id="liveTripPassengers" class="d-flex flex-wrap gap-2"></div>
                            </div>
                            <div class="d-flex justify-content-between align-items-center text-muted small pt-2 border-top">
                                <span><i class="bi bi-geo-alt text-primary"></i> <span id="liveRouteDistance">--</span></span>
                                <span id="liveGpsAccuracy" class="gps-accuracy good">GPS: Acquiring...</span>
                                <span><i class="bi bi-clock"></i> <span id="liveLastUpdated">Just now</span></span>
                            </div>
                        </div>

                        <div id="liveDashboardMap" class="map-container rounded-4 mb-3" style="height: 280px; width: 100%; background: #e9ecef; z-index: 1;"></div>
                        
                        <h6 class="fw-bold small text-muted text-uppercase mb-2">Share Live Tracking via WhatsApp</h6>
                        <div class="row g-2 mb-3" id="shareButtonsContainer">
                            <!-- Populated dynamically per passenger -->
                        </div>
                        
                        <button class="btn btn-outline-danger w-100 rounded-pill fw-bold py-2" id="btnEndTrip">
                            <i class="bi bi-stop-circle me-1"></i> END TRIP & SAVE SUMMARY
                        </button>
                    </div>
                </div>
            `;
            
            document.getElementById('btnEndTrip').addEventListener('click', () => {
                endTripModalInstance.show();
            });

            document.getElementById('btnConfirmEndTrip').onclick = async () => {
                endTripModalInstance.hide();
                await window.CarpoolTracker.endTrip();
                renderCurrentTripSection();
                await renderStatCards();
                renderDebugPanel();
            };
        }

        updateLiveTripUI();
    }
}

function updateLiveTripUI() {
    const tripId = window.CarpoolTracker.getActiveTripId();
    if (!tripId) return;

    window.CarpoolApp.rtdb.ref('liveTrips/' + tripId).on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data || data.status !== 'active') {
            renderCurrentTripSection();
            return;
        }

        const paxContainer = document.getElementById('liveTripPassengers');
        if (paxContainer && data.passengers) {
            paxContainer.innerHTML = data.passengers.map(pName => 
                `<span class="badge bg-primary rounded-pill px-3 py-1"><i class="bi bi-person-fill me-1"></i> ${window.CarpoolApp.escapeHtml(pName)}</span>`
            ).join('');
        }

        const routeDistEl = document.getElementById('liveRouteDistance');
        if (routeDistEl) {
            routeDistEl.textContent = `Route: ${data.actualRouteDistance || 19} km`;
        }

        const gpsEl = document.getElementById('liveGpsAccuracy');
        if (gpsEl && data.accuracy) {
            const acc = Math.round(data.accuracy);
            gpsEl.textContent = `GPS: ±${acc}m`;
            gpsEl.className = `gps-accuracy ${acc < 30 ? 'good' : (acc < 100 ? 'medium' : 'poor')}`;
        }

        const lastUpEl = document.getElementById('liveLastUpdated');
        if (lastUpEl && data.timestamp) {
            lastUpEl.textContent = window.CarpoolApp.timeAgo(data.timestamp);
        }

        // WhatsApp Share Buttons for each passenger
        const shareContainer = document.getElementById('shareButtonsContainer');
        if (shareContainer && data.passengers) {
            const allPeople = window.CarpoolApp.getPeople();
            const link = window.CarpoolTracker.generateShareLink(tripId);

            let buttonsHtml = '';
            data.passengers.forEach(pName => {
                const pObj = allPeople.find(x => x.name.toLowerCase() === pName.toLowerCase() || x.id === pName);
                const phone = pObj ? pObj.phone : '';
                const msg = window.CarpoolTracker.generateShareMessage(tripId, pName);

                buttonsHtml += `
                    <div class="col-12 col-sm-6">
                        <button class="btn btn-whatsapp w-100 rounded-pill py-2 shadow-sm text-start d-flex align-items-center justify-content-between" 
                            onclick="window.CarpoolApp.openWhatsApp('${phone}', '${msg}')">
                            <span><i class="bi bi-whatsapp me-2"></i> Share with <strong>${window.CarpoolApp.escapeHtml(pName)}</strong></span>
                            <span class="badge bg-white text-success rounded-pill px-2 py-1 small">WhatsApp</span>
                        </button>
                    </div>
                `;
            });

            buttonsHtml += `
                <div class="col-6">
                    <button class="btn btn-outline-secondary w-100 rounded-pill py-2 small" onclick="window.CarpoolApp.copyToClipboard('${window.CarpoolTracker.generateShareMessage(tripId, 'Passenger')}')">
                        <i class="bi bi-clipboard me-1"></i> Copy Message
                    </button>
                </div>
                <div class="col-6">
                    <button class="btn btn-outline-secondary w-100 rounded-pill py-2 small" onclick="window.CarpoolApp.copyToClipboard('${link}')">
                        <i class="bi bi-link-45deg me-1"></i> Copy Link
                    </button>
                </div>
            `;
            shareContainer.innerHTML = buttonsHtml;
        }

        // Leaflet Map Rendering
        const lat = data.lat;
        const lng = data.lng;
        const mapEl = document.getElementById('liveDashboardMap');

        if (mapEl && lat && lng) {
            if (!mapInstance) {
                mapInstance = L.map('liveDashboardMap').setView([lat, lng], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors'
                }).addTo(mapInstance);

                const carIcon = L.divIcon({
                    className: 'custom-car-marker',
                    html: '<div style="background:#4361ee;color:#fff;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(67,97,238,0.5);border:2px solid white;"><i class="bi bi-car-front-fill"></i></div>',
                    iconSize: [34, 34],
                    iconAnchor: [17, 17]
                });

                mapMarker = L.marker([lat, lng], { icon: carIcon }).addTo(mapInstance);
                mapMarker.bindPopup(`<b>🚗 ${data.driverName}'s Car</b><br/>Live GPS`).openPopup();
            } else {
                mapMarker.setLatLng([lat, lng]);
                mapInstance.setView([lat, lng]);
            }
        }
    });
}

function showStartTripModal() {
    const passengers = window.CarpoolApp.getPassengers().filter(p => p.active !== false);
    const driver = window.CarpoolApp.getDriver();
    const settings = window.CarpoolApp.getSettings();
    const petrolPrice = settings.petrolPrice || 105;
    const mileage = settings.mileage || 12;
    const ratePerKm = window.CarpoolApp.calculateRatePerKm(petrolPrice, mileage);

    document.getElementById('modalDriverName').textContent = `${driver ? driver.name : 'Vivek'} (Starting from ${driver?.homeLocation || 'Home'})`;
    
    const defaultRouteDist = settings.driverDistance || 17;
    document.getElementById('modalRouteDistance').value = defaultRouteDist;

    const tbody = document.getElementById('modalPassengerTableBody');
    tbody.innerHTML = '';

    passengers.forEach(p => {
        const defaultPickupDist = p.pickupDistance !== undefined ? p.pickupDistance : (p.distance || 10);
        const tr = document.createElement('tr');
        tr.id = `modalPaxRow_${p.id}`;
        tr.innerHTML = `
            <td class="text-center">
                <input class="form-check-input start-trip-pax fs-5" type="checkbox" value="${p.id}" id="startPax_${p.id}" checked>
            </td>
            <td>
                <strong>${window.CarpoolApp.escapeHtml(p.name)}</strong>
                <div class="text-muted small">${window.CarpoolApp.escapeHtml(p.pickupLocation || `${p.name} Pickup`)}</div>
            </td>
            <td style="width: 130px;">
                <div class="input-group input-group-sm">
                    <input type="number" class="form-control pax-dist-input fw-bold" data-pid="${p.id}" value="${defaultPickupDist}" step="0.1" min="0.1">
                    <span class="input-group-text">km</span>
                </div>
            </td>
            <td>
                <span class="badge bg-light text-dark border pax-source-badge" id="sourceBadge_${p.id}">Manual</span>
            </td>
            <td>
                <span class="pax-chargeable-dist fw-bold" id="chargeableDist_${p.id}">${defaultPickupDist} km</span>
            </td>
            <td>
                <span class="text-muted small">₹${ratePerKm.toFixed(2)}/km</span>
            </td>
            <td>
                <strong class="text-primary pax-amount-preview" id="amountPreview_${p.id}">₹0.00</strong>
            </td>
        `;
        tbody.appendChild(tr);

        // Listeners for live recalculation
        tr.querySelector('.pax-dist-input').addEventListener('input', updateModalFares);
        tr.querySelector('.start-trip-pax').addEventListener('change', updateModalFares);
    });

    document.getElementById('modalTripType').addEventListener('change', updateModalFares);
    document.getElementById('modalRouteDistance').addEventListener('input', updateModalFares);

    function updateModalFares() {
        const tripType = document.getElementById('modalTripType').value;
        const multiplier = tripType === 'Full Day' ? 2 : 1;
        const routeDist = parseFloat(document.getElementById('modalRouteDistance').value) || 19;
        const fuelCost = window.CarpoolApp.calculateFuelCost(routeDist, mileage, petrolPrice);

        const selectedPaxIds = Array.from(document.querySelectorAll('.start-trip-pax:checked')).map(cb => cb.value);

        const customData = { passengerDistances: {} };
        passengers.forEach(p => {
            const distInput = document.querySelector(`.pax-dist-input[data-pid="${p.id}"]`);
            const distVal = parseFloat(distInput ? distInput.value : 0) || (p.pickupDistance || p.distance || 10);
            customData.passengerDistances[p.id] = distVal * multiplier;
        });

        const shares = window.CarpoolApp.calculateShares(fuelCost, selectedPaxIds, settings.sharingMode, customData, {
            ratePerKm: ratePerKm,
            petrolPrice: petrolPrice,
            mileage: mileage,
            actualDistance: routeDist
        });

        passengers.forEach(p => {
            const isChecked = document.getElementById(`startPax_${p.id}`)?.checked;
            const distInput = document.querySelector(`.pax-dist-input[data-pid="${p.id}"]`);
            const distVal = parseFloat(distInput ? distInput.value : 0) || 0;
            const chargeable = distVal * multiplier;
            const amt = shares[p.id] || 0;

            const chargeableEl = document.getElementById(`chargeableDist_${p.id}`);
            const amountEl = document.getElementById(`amountPreview_${p.id}`);
            const sourceEl = document.getElementById(`sourceBadge_${p.id}`);

            if (chargeableEl) chargeableEl.textContent = `${chargeable.toFixed(1)} km`;
            if (amountEl) amountEl.textContent = `₹${amt.toFixed(2)}`;
            if (sourceEl) sourceEl.textContent = 'Manual';

            const row = document.getElementById(`modalPaxRow_${p.id}`);
            if (row) row.style.opacity = isChecked ? '1' : '0.4';
        });
    }

    updateModalFares();
    startTripModalInstance.show();
    
    document.getElementById('btnConfirmStartTrip').onclick = async () => {
        const selected = Array.from(document.querySelectorAll('.start-trip-pax:checked')).map(cb => cb.value);
        if (selected.length === 0) {
            window.CarpoolApp.showToast('Please select at least one passenger.', 'warning');
            return;
        }

        const routeDist = parseFloat(document.getElementById('modalRouteDistance').value) || 19;
        const tripType = document.getElementById('modalTripType').value;
        const fuelCost = window.CarpoolApp.calculateFuelCost(routeDist, mileage, petrolPrice);
        const multiplier = tripType === 'Full Day' ? 2 : 1;

        const customData = { passengerDistances: {} };
        selected.forEach(pid => {
            const pObj = passengers.find(x => x.id === pid);
            const distInput = document.querySelector(`.pax-dist-input[data-pid="${pid}"]`);
            const manualDist = distInput ? parseFloat(distInput.value) : (pObj?.pickupDistance || 10);
            customData.passengerDistances[pid] = manualDist * multiplier;
        });

        const shares = window.CarpoolApp.calculateShares(fuelCost, selected, settings.sharingMode, customData, {
            ratePerKm: ratePerKm,
            petrolPrice: petrolPrice,
            mileage: mileage,
            actualDistance: routeDist
        });

        const passengerDetails = {};
        selected.forEach((pid, idx) => {
            const pObj = passengers.find(x => x.id === pid);
            const distInput = document.querySelector(`.pax-dist-input[data-pid="${pid}"]`);
            const manualDist = distInput ? parseFloat(distInput.value) : (pObj?.pickupDistance || 10);
            const finalDist = manualDist * multiplier;
            const amount = shares[pid] !== undefined ? shares[pid] : parseFloat((finalDist * ratePerKm).toFixed(2));

            passengerDetails[pid] = {
                passengerId: pid,
                passengerName: pObj ? pObj.name : pid,
                pickupLocation: pObj?.pickupLocation || `${pObj?.name} Pickup`,
                pickupOrder: idx + 1,
                calculatedPickupDistance: pObj?.distance || 10,
                manualPickupDistance: manualDist,
                finalPickupDistance: finalDist,
                distanceSource: 'manual',
                chargeableDistance: finalDist,
                ratePerKm: ratePerKm,
                amount: amount
            };
        });
        
        startTripModalInstance.hide();
        await window.CarpoolTracker.startTrip(selected, {
            actualRouteDistance: routeDist,
            passengerDetails: passengerDetails,
            tripType: tripType
        });
        renderCurrentTripSection();
        renderDebugPanel();
    };
}

function renderQuickTripEntry() {
    const passengers = window.CarpoolApp.getPassengers().filter(p => p.active !== false);
    const container = document.getElementById('quickTripPassengers');
    const settings = window.CarpoolApp.getSettings();
    const petrolPrice = settings.petrolPrice || 105;
    const mileage = settings.mileage || 12;
    const ratePerKm = window.CarpoolApp.calculateRatePerKm(petrolPrice, mileage);

    container.innerHTML = passengers.map(p => {
        const pDist = p.pickupDistance !== undefined ? p.pickupDistance : (p.distance || 10);
        return `
            <input type="checkbox" class="btn-check quick-trip-pax" id="quickPax_${p.id}" value="${p.id}" checked>
            <label class="btn btn-outline-primary rounded-pill px-3 py-2" for="quickPax_${p.id}">
                <i class="bi bi-person-fill me-1"></i> ${window.CarpoolApp.escapeHtml(p.name)} <small class="badge bg-light text-dark ms-1">${pDist}km</small>
            </label>
        `;
    }).join('');

    function updateQuickPreview() {
        const typeEl = document.querySelector('input[name="quickTripType"]:checked');
        const type = typeEl ? typeEl.value : 'Office';
        const distance = window.CarpoolApp.getDefaultDistance(type, settings.driverDistance || 17);
        const fuelCost = window.CarpoolApp.calculateFuelCost(distance, mileage, petrolPrice);

        document.getElementById('quickTripDistPreview').textContent = `${distance} km`;
        document.getElementById('quickTripCostPreview').textContent = window.CarpoolApp.formatCurrency(fuelCost);
        document.getElementById('quickTripRatePreview').textContent = `₹${ratePerKm.toFixed(2)}/km`;
    }

    document.querySelectorAll('input[name="quickTripType"]').forEach(r => r.addEventListener('change', updateQuickPreview));
    updateQuickPreview();
    
    document.getElementById('btnQuickSaveTrip').onclick = async () => {
        const btn = document.getElementById('btnQuickSaveTrip');
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> Saving Trip...`;

        const typeEl = document.querySelector('input[name="quickTripType"]:checked');
        const type = typeEl ? typeEl.value : 'Office';
        
        const selectedPaxIds = Array.from(document.querySelectorAll('.quick-trip-pax:checked')).map(cb => cb.value);
        if (selectedPaxIds.length === 0) {
            window.CarpoolApp.showToast('Please select at least one passenger.', 'warning');
            btn.disabled = false;
            btn.innerHTML = `<i class="bi bi-check2-circle me-1"></i> Save Trip to History`;
            return;
        }
        
        const distance = window.CarpoolApp.getDefaultDistance(type, settings.driverDistance || 17);
        const fuelUsed = window.CarpoolApp.calculateFuelUsed(distance, mileage);
        const fuelCost = window.CarpoolApp.calculateFuelCost(distance, mileage, petrolPrice);
        
        const multiplier = type === 'Full Day' ? 2 : 1;
        const customData = { passengerDistances: {} };
        selectedPaxIds.forEach(pid => {
            const pObj = passengers.find(x => x.id === pid);
            const baseDist = pObj ? (pObj.pickupDistance || pObj.distance || 10) : 10;
            customData.passengerDistances[pid] = baseDist * multiplier;
        });

        const passengerShares = window.CarpoolApp.calculateShares(fuelCost, selectedPaxIds, settings.sharingMode, customData, {
            ratePerKm: ratePerKm,
            petrolPrice: petrolPrice,
            mileage: mileage,
            actualDistance: distance
        });

        const passengerDetails = {};
        selectedPaxIds.forEach((pid, idx) => {
            const pObj = passengers.find(x => x.id === pid);
            const baseDist = pObj ? (pObj.pickupDistance || pObj.distance || 10) : 10;
            const finalDist = baseDist * multiplier;
            const amount = passengerShares[pid] !== undefined ? passengerShares[pid] : parseFloat((finalDist * ratePerKm).toFixed(2));

            passengerDetails[pid] = {
                passengerId: pid,
                passengerName: pObj ? pObj.name : pid,
                pickupLocation: pObj?.pickupLocation || `${pObj?.name} Pickup`,
                pickupOrder: idx + 1,
                calculatedPickupDistance: pObj?.distance || 10,
                manualPickupDistance: baseDist,
                finalPickupDistance: finalDist,
                distanceSource: 'manual',
                chargeableDistance: finalDist,
                ratePerKm: ratePerKm,
                amount: amount
            };
        });

        const tripData = {
            date: window.CarpoolApp.formatDateISO(new Date()),
            type: type,
            driverId: settings.driverId || 'vivek',
            driverName: settings.driverName || 'Vivek',
            actualRouteDistance: distance,
            actualDistance: distance,
            finalRouteDistance: distance,
            distanceSource: 'manual',
            fuelUsed: fuelUsed,
            fuelCost: fuelCost,
            ratePerKm: ratePerKm,
            petrolPrice: petrolPrice,
            mileage: mileage,
            passengers: selectedPaxIds,
            passengerDetails: passengerDetails,
            passengerShares: passengerShares,
            sharingMode: settings.sharingMode || 'distance',
            status: 'Completed',
            notes: `Quick entry logged for ${type} trip.`
        };
        
        try {
            await window.CarpoolApp.saveTrip(tripData);
            await renderStatCards();
            renderDebugPanel();
            
            // Reset selection
            document.getElementById('typeOffice').checked = true;
            document.querySelectorAll('.quick-trip-pax').forEach(cb => cb.checked = true);
            updateQuickPreview();
        } catch (err) {
            console.error("Error saving quick trip:", err);
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="bi bi-check2-circle me-1"></i> Save Trip to History`;
        }
    };
}

function renderDebugPanel() {
    const debugEl = document.getElementById('debugCalcContent');
    if (!debugEl) return;

    const settings = window.CarpoolApp.getSettings();
    const driver = window.CarpoolApp.getDriver();
    const passengers = window.CarpoolApp.getPassengers();
    const petrolPrice = settings.petrolPrice || 105;
    const mileage = settings.mileage || 12;
    const ratePerKm = window.CarpoolApp.calculateRatePerKm(petrolPrice, mileage);
    const mode = settings.sharingMode || 'distance';

    const sampleTripDistance = 19;
    const totalTripCost = window.CarpoolApp.calculateFuelCost(sampleTripDistance, mileage, petrolPrice);
    const activePaxIds = passengers.filter(p => p.active !== false).map(p => p.id);

    const customData = { passengerDistances: {} };
    passengers.forEach(p => {
        customData.passengerDistances[p.id] = p.pickupDistance !== undefined ? p.pickupDistance : (p.distance || 10);
    });

    const calculatedShares = window.CarpoolApp.calculateShares(totalTripCost, activePaxIds, mode, customData, {
        ratePerKm: ratePerKm,
        petrolPrice: petrolPrice,
        mileage: mileage,
        actualDistance: sampleTripDistance
    });

    let modeLabel = 'Distance-Based Billing';
    if (mode === 'equal') modeLabel = 'Equal Split (Total ÷ [Passengers + Driver])';
    else if (mode === 'passenger_only' || mode === 'passenger-only') modeLabel = 'Passenger Only (Total ÷ Passengers)';
    else if (mode === 'custom_percentage' || mode === 'custom-percentage') modeLabel = 'Custom Percentage';

    let html = `
DRIVER: ${driver ? driver.name : 'Vivek'} (Base: ${driver?.distance || 17} km, Starting: ${driver?.homeLocation || 'Home'})
CAR: ${settings.carName || 'Tata Tiago'} | Mileage: ${mileage} km/l | Petrol Price: ₹${petrolPrice}/L
RATE PER KM: ₹${petrolPrice} / ${mileage} km/l = ₹${ratePerKm.toFixed(2)}/km

ACTIVE SHARING POLICY: [${mode.toUpperCase()}] — ${modeLabel}

SAMPLE ROUTE BREAKDOWN:
Vivek Home (0 km) → Jaydeep (9 km) → Madhura (12 km) → Office (19 km)
Total Route Distance = ${sampleTripDistance} km | Total Fuel Cost = ₹${totalTripCost.toFixed(2)}

PASSENGER SHARES UNDER CURRENT POLICY (${mode}):
`;

    passengers.forEach((p, idx) => {
        const pDist = p.pickupDistance !== undefined ? p.pickupDistance : (p.distance || 10);
        const share = calculatedShares[p.id] !== undefined ? calculatedShares[p.id] : (pDist * ratePerKm);
        html += `
• [${p.name}] (Order: ${idx + 1})
  Pickup: ${p.pickupLocation || `${p.name} Landmark`} | Pickup Dist: ${pDist} km
  Assigned Fare: ₹${share.toFixed(2)}`;
    });

    debugEl.textContent = html;
}
