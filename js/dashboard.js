// js/dashboard.js

async function initDashboard() {
    await renderStatCards();
    renderCurrentTripSection();
    renderQuickTripEntry();
    
    // Refresh stats and live trip section periodically
    setInterval(() => {
        if (window.CarpoolTracker.isTracking()) {
            updateLiveTripUI();
        }
    }, 10000);
}

async function renderStatCards() {
    const { month, year } = window.CarpoolApp.getCurrentMonthYear();
    const trips = await window.CarpoolApp.getTrips({ month, year }) || [];
    const passengers = window.CarpoolApp.getPassengers();
    
    let totalTrips = trips.length;
    let totalKm = 0;
    let totalFuelUsed = 0;
    let totalFuelCost = 0;
    
    let passengerShares = {};
    passengers.forEach(p => passengerShares[p.id] = 0);
    
    trips.forEach(t => {
        totalKm += (t.actualDistance || 0);
        totalFuelUsed += (t.fuelUsed || 0);
        totalFuelCost += (t.fuelCost || 0);
        
        if (t.passengerShares) {
            for (let pid in t.passengerShares) {
                if (passengerShares[pid] !== undefined) {
                    passengerShares[pid] += t.passengerShares[pid];
                }
            }
        }
    });

    let statCardsHtml = `
        <div class="col-6 col-md-4">
            <div class="stat-card">
                <div class="stat-icon bg-blue"><i class="bi bi-car-front"></i></div>
                <div class="stat-label">Total Trips</div>
                <div class="stat-value" id="statTotalTrips">${totalTrips}</div>
                <div class="stat-sub">This month</div>
            </div>
        </div>
        <div class="col-6 col-md-4">
            <div class="stat-card">
                <div class="stat-icon bg-teal"><i class="bi bi-geo-alt"></i></div>
                <div class="stat-label">Total KM</div>
                <div class="stat-value">${totalKm.toFixed(1)}</div>
                <div class="stat-sub">This month</div>
            </div>
        </div>
        <div class="col-6 col-md-4">
            <div class="stat-card">
                <div class="stat-icon bg-orange"><i class="bi bi-fuel-pump"></i></div>
                <div class="stat-label">Fuel Used</div>
                <div class="stat-value">${totalFuelUsed.toFixed(1)} L</div>
                <div class="stat-sub">This month</div>
            </div>
        </div>
        <div class="col-6 col-md-4">
            <div class="stat-card">
                <div class="stat-icon bg-green"><i class="bi bi-currency-rupee"></i></div>
                <div class="stat-label">Fuel Cost</div>
                <div class="stat-value">${window.CarpoolApp.formatCurrencyShort(totalFuelCost)}</div>
                <div class="stat-sub">This month</div>
            </div>
        </div>
    `;

    // Dynamic passenger due cards (max 2)
    const activePax = passengers.slice(0, 2);
    activePax.forEach((p, index) => {
        const colorClass = index === 0 ? 'bg-purple' : 'bg-pink';
        const amount = passengerShares[p.id] || 0;
        statCardsHtml += `
            <div class="col-6 col-md-4">
                <div class="stat-card">
                    <div class="stat-icon ${colorClass}"><i class="bi bi-person"></i></div>
                    <div class="stat-label">${p.name} Due</div>
                    <div class="stat-value">${window.CarpoolApp.formatCurrencyShort(amount)}</div>
                    <div class="stat-sub">pending</div>
                </div>
            </div>
        `;
    });
    
    document.getElementById('statCards').innerHTML = statCardsHtml;
}

let activeTripListenerCleanup = null;

function renderCurrentTripSection() {
    const container = document.getElementById('currentTripSection');
    const isTracking = window.CarpoolTracker.isTracking();
    const tripId = window.CarpoolTracker.getActiveTripId();

    if (!isTracking) {
        if (activeTripListenerCleanup) {
            activeTripListenerCleanup();
            activeTripListenerCleanup = null;
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
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="card-title mb-0 d-flex align-items-center">
                                <span class="spinner-grow spinner-grow-sm text-danger me-2" role="status"></span>
                                Live Trip
                            </h5>
                            <span class="badge bg-danger rounded-pill">LIVE</span>
                        </div>
                        <div id="liveTripPassengers" class="mb-3 d-flex flex-wrap gap-2"></div>
                        <div id="map-container" class="map-container rounded-3 mb-3" style="height: 300px; width: 100%; background: #eee; z-index: 1;"></div>
                        
                        <div class="d-flex justify-content-between text-muted small mb-3">
                            <span id="gpsAccuracy"><i class="bi bi-crosshair"></i> Waiting for GPS...</span>
                            <span id="lastUpdated"><i class="bi bi-clock"></i> Just now</span>
                        </div>
                        
                        <div class="d-grid gap-2" id="shareButtons">
                            <!-- Populated dynamically -->
                        </div>
                        
                        <button class="btn btn-outline-danger w-100 mt-3 rounded-pill fw-bold" id="btnEndTrip">
                            END TRIP
                        </button>
                    </div>
                </div>
            `;
            
            document.getElementById('btnEndTrip').addEventListener('click', async () => {
                await window.CarpoolTracker.endTrip();
                renderCurrentTripSection(); 
            });
            
            // Initialize map for the driver view
            activeTripListenerCleanup = window.CarpoolTracker.initPassengerView(tripId, 'map-container');
        }
        updateLiveTripUI();
    }
}

function updateLiveTripUI() {
    const tripId = window.CarpoolTracker.getActiveTripId();
    if (!tripId) return;

    window.CarpoolApp.rtdb.ref('liveTrips/' + tripId).once('value').then(snap => {
        const data = snap.val();
        if (data) {
            const accEl = document.getElementById('gpsAccuracy');
            const updEl = document.getElementById('lastUpdated');
            if (accEl) accEl.innerHTML = `<i class="bi bi-crosshair"></i> Accuracy: ${Math.round(data.accuracy || 0)}m`;
            if (updEl) updEl.innerHTML = `<i class="bi bi-clock"></i> Updated ${window.CarpoolApp.timeAgo(data.timestamp)}`;
            
            const paxContainer = document.getElementById('liveTripPassengers');
            if (paxContainer && data.passengers) {
                paxContainer.innerHTML = data.passengers.map(pName => 
                    `<span class="badge bg-light text-dark border rounded-pill px-3 py-2"><i class="bi bi-person text-primary"></i> ${pName}</span>`
                ).join('');
                
                const shareContainer = document.getElementById('shareButtons');
                if (shareContainer && shareContainer.innerHTML.trim() === '') {
                    const link = window.CarpoolTracker.generateShareLink(tripId);
                    let shareHtml = '';
                    
                    data.passengers.forEach(pName => {
                        const msg = window.CarpoolTracker.generateShareMessage(tripId, pName);
                        const paxObj = window.CarpoolApp.getPassengers().find(p => p.name === pName);
                        const phone = paxObj ? paxObj.phone : '';
                        shareHtml += `
                            <button class="btn btn-outline-success text-start rounded-pill" onclick="window.CarpoolApp.openWhatsApp('${phone}', '${encodeURIComponent(msg)}')">
                                <i class="bi bi-whatsapp"></i> Share to ${pName}
                            </button>
                        `;
                    });
                    
                    shareHtml += `
                        <button class="btn btn-outline-secondary text-start rounded-pill" onclick="window.CarpoolApp.copyToClipboard('${link}')">
                            <i class="bi bi-link-45deg"></i> Copy Link
                        </button>
                    `;
                    shareContainer.innerHTML = shareHtml;
                }
            }
        }
    });
}

function showStartTripModal() {
    const passengers = window.CarpoolApp.getPassengers().filter(p => p.active);
    const container = document.getElementById('startTripPassengers');
    
    container.innerHTML = passengers.map(p => `
        <div class="form-check custom-checkbox py-2 border-bottom">
            <input class="form-check-input start-trip-pax fs-4" type="checkbox" value="${p.name}" id="startPax_${p.id}" checked>
            <label class="form-check-label fs-5 ms-2 pt-1" for="startPax_${p.id}">
                ${p.name}
            </label>
        </div>
    `).join('');
    
    const modal = new bootstrap.Modal(document.getElementById('startTripModal'));
    modal.show();
    
    document.getElementById('btnConfirmStartTrip').onclick = async () => {
        const selected = Array.from(document.querySelectorAll('.start-trip-pax:checked')).map(cb => cb.value);
        if (selected.length === 0) {
            window.CarpoolApp.showToast('Please select at least one passenger', 'warning');
            return;
        }
        
        modal.hide();
        await window.CarpoolTracker.startTrip(selected);
        renderCurrentTripSection();
    };
}

function renderQuickTripEntry() {
    const passengers = window.CarpoolApp.getPassengers().filter(p => p.active);
    const container = document.getElementById('quickTripPassengers');
    
    container.innerHTML = passengers.map(p => `
        <input type="checkbox" class="btn-check quick-trip-pax" id="quickPax_${p.id}" value="${p.id}" checked>
        <label class="btn btn-outline-secondary rounded-pill" for="quickPax_${p.id}">
            <i class="bi bi-person"></i> ${p.name}
        </label>
    `).join('');
    
    document.getElementById('btnQuickSaveTrip').addEventListener('click', async () => {
        const btn = document.getElementById('btnQuickSaveTrip');
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...`;

        const typeEl = document.querySelector('input[name="quickTripType"]:checked');
        const type = typeEl ? typeEl.value : 'Office';
        
        const selectedPaxIds = Array.from(document.querySelectorAll('.quick-trip-pax:checked')).map(cb => cb.value);
        if (selectedPaxIds.length === 0) {
            window.CarpoolApp.showToast('Select at least one passenger', 'warning');
            btn.disabled = false;
            btn.innerHTML = `<i class="bi bi-check2-circle"></i> Save Quick Trip`;
            return;
        }
        
        const settings = window.CarpoolApp.getSettings();
        const distance = window.CarpoolApp.getDefaultDistance(type, settings.driverDistance || 10);
        const fuelUsed = window.CarpoolApp.calculateFuelUsed(distance, settings.mileage);
        const fuelCost = window.CarpoolApp.calculateFuelCost(distance, settings.mileage, settings.petrolPrice);
        const paxShares = window.CarpoolApp.calculateShares(fuelCost, selectedPaxIds, settings.sharingMode, settings.customPercentages);
        
        const tripData = {
            date: window.CarpoolApp.formatDateISO(new Date()),
            type: type,
            actualDistance: distance,
            fuelUsed: fuelUsed,
            fuelCost: fuelCost,
            passengers: selectedPaxIds,
            passengerShares: paxShares,
            status: 'completed'
        };
        
        try {
            await window.CarpoolApp.saveTrip(tripData);
            window.CarpoolApp.showToast('Trip logged successfully!', 'success');
            await renderStatCards(); 
            
            // reset UI
            document.getElementById('typeOffice').checked = true;
            document.querySelectorAll('.quick-trip-pax').forEach(cb => cb.checked = true);
        } catch (err) {
            console.error("Error saving quick trip", err);
            window.CarpoolApp.showToast('Failed to log trip', 'danger');
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="bi bi-check2-circle"></i> Save Quick Trip`;
        }
    });
}

// Initialize the dashboard page
window.CarpoolApp.init('dashboard', initDashboard);
