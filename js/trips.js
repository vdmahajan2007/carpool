// ============================================================
// js/trips.js — Trip Management Logic
// ============================================================

CarpoolApp.init('trips', async function() {
    // Elements
    const tripForm = document.getElementById('tripForm');
    const tripDate = document.getElementById('tripDate');
    const tripTypeRadios = document.getElementsByName('tripType');
    const tripStatusRadios = document.getElementsByName('tripStatus');
    const passengersContainer = document.getElementById('passengersContainer');
    const tripDistance = document.getElementById('tripDistance');
    const overrideDistance = document.getElementById('overrideDistance');
    const tripNotes = document.getElementById('tripNotes');
    
    // Live Calc Elements
    const calcFuelUsed = document.getElementById('calcFuelUsed');
    const calcFuelCost = document.getElementById('calcFuelCost');
    const calcRatePerKm = document.getElementById('calcRatePerKm');
    const calcShares = document.getElementById('calcShares');
    const liveSharingModeBadge = document.getElementById('liveSharingModeBadge');
    
    // History Elements
    const tripsTableBody = document.getElementById('tripsTableBody');
    const emptyState = document.getElementById('emptyState');
    const filterMonth = document.getElementById('filterMonth');
    const filterYear = document.getElementById('filterYear');
    const filterPassenger = document.getElementById('filterPassenger');
    const filterStatus = document.getElementById('filterStatus');
    
    // Edit/Delete Elements
    const tripIdInput = document.getElementById('tripId');
    const saveTripBtn = document.getElementById('saveTripBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const formTitle = document.getElementById('formTitle');
    
    let deleteModal;
    let tripToDelete = null;

    // State
    let settings = CarpoolApp.getSettings();
    let driver = CarpoolApp.getDriver();
    let passengers = CarpoolApp.getPassengers();
    
    function init() {
        if (!tripDate.value) tripDate.value = CarpoolApp.formatDateISO(new Date());
        
        renderPassengers();
        populateDateFilters();
        
        deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
        document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
        
        tripForm.addEventListener('submit', handleSaveTrip);
        cancelEditBtn.addEventListener('click', resetForm);

        overrideDistance.addEventListener('change', () => {
            tripDistance.readOnly = !overrideDistance.checked;
            if (!overrideDistance.checked) calculateDistance();
            updateCalculations();
        });

        tripDistance.addEventListener('input', updateCalculations);
        tripDate.addEventListener('change', updateCalculations);
        
        Array.from(tripTypeRadios).forEach(radio => radio.addEventListener('change', () => {
            if (!overrideDistance.checked) calculateDistance();
            updateCalculations();
        }));
        
        Array.from(tripStatusRadios).forEach(radio => radio.addEventListener('change', () => {
            const isCompleted = radio.value === 'Completed';
            passengersContainer.style.opacity = isCompleted ? '1' : '0.5';
            updateCalculations();
        }));
        
        [filterMonth, filterYear, filterPassenger, filterStatus].forEach(el => {
            el.addEventListener('change', loadTrips);
        });

        calculateDistance();
        updateCalculations();
        loadTrips();
    }
    
    function renderPassengers(existingDetails) {
        passengers = CarpoolApp.getPassengers();
        passengersContainer.innerHTML = '';
        filterPassenger.innerHTML = '<option value="">All Passengers</option>';
        
        if (passengers.length === 0) {
            passengersContainer.innerHTML = '<span class="text-muted small">No active passengers found. Please add members in People page.</span>';
            return;
        }

        const tripType = getSelectedTripType();
        const multiplier = tripType === 'Full Day' ? 2 : 1;

        passengers.forEach(p => {
            let defaultDist = p.pickupDistance !== undefined ? p.pickupDistance : (p.distance || 10);
            let isChecked = true;
            let distVal = defaultDist;

            if (existingDetails && existingDetails[p.id]) {
                isChecked = true;
                distVal = existingDetails[p.id].manualPickupDistance !== undefined ? existingDetails[p.id].manualPickupDistance : existingDetails[p.id].finalDistance;
            }

            const div = document.createElement('div');
            div.className = `passenger-row-card ${isChecked ? 'selected' : ''}`;
            div.id = `paxCard_${p.id}`;
            div.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <div class="form-check mb-0">
                        <input class="form-check-input passenger-checkbox fs-5" type="checkbox" value="${p.id}" id="chk_${p.id}" ${isChecked ? 'checked' : ''}>
                        <label class="form-check-label fw-bold ms-1" for="chk_${p.id}">
                            ${CarpoolApp.escapeHtml(p.name)}
                        </label>
                        <div class="text-muted small ms-1">${p.pickupLocation || `${p.name} Pickup`}</div>
                    </div>
                    <div class="d-flex align-items-center gap-2" style="max-width: 150px;">
                        <span class="badge bg-light text-dark border small">Manual:</span>
                        <div class="input-group input-group-sm">
                            <input type="number" class="form-control pax-custom-dist fw-bold text-end" id="paxDist_${p.id}" data-pid="${p.id}" value="${distVal}" step="0.1" min="0.1">
                            <span class="input-group-text">km</span>
                        </div>
                    </div>
                </div>
            `;
            passengersContainer.appendChild(div);
            
            // Event listeners
            const chk = div.querySelector('.passenger-checkbox');
            const distInp = div.querySelector('.pax-custom-dist');

            chk.addEventListener('change', () => {
                div.classList.toggle('selected', chk.checked);
                updateCalculations();
            });

            distInp.addEventListener('input', updateCalculations);
            
            // Filter dropdown
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            filterPassenger.appendChild(opt);
        });
    }
    
    function populateDateFilters() {
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        
        CarpoolApp.MONTHS.forEach((month, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.textContent = month;
            if (index === currentMonth) opt.selected = true;
            filterMonth.appendChild(opt);
        });
        
        for (let y = currentYear - 2; y <= currentYear + 2; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === currentYear) opt.selected = true;
            filterYear.appendChild(opt);
        }
    }
    
    function getSelectedTripType() {
        const checked = document.querySelector('input[name="tripType"]:checked');
        return checked ? checked.value : 'Full Day';
    }
    
    function getSelectedStatus() {
        const checked = document.querySelector('input[name="tripStatus"]:checked');
        return checked ? checked.value : 'Completed';
    }
    
    function getSelectedPassengers() {
        return Array.from(document.querySelectorAll('.passenger-checkbox:checked')).map(cb => cb.value);
    }
    
    function calculateDistance() {
        const type = getSelectedTripType();
        driver = CarpoolApp.getDriver();
        const defaultDist = CarpoolApp.getDefaultDistance(type, driver ? driver.distance : 17);
        tripDistance.value = defaultDist;
    }
    
    function updateCalculations() {
        settings = CarpoolApp.getSettings();
        const petrolPrice = settings.petrolPrice || 105;
        const mileage = settings.mileage || 12;
        const ratePerKm = CarpoolApp.calculateRatePerKm(petrolPrice, mileage);

        const distance = parseFloat(tripDistance.value) || 0;
        const status = getSelectedStatus();
        const tripType = getSelectedTripType();
        const multiplier = tripType === 'Full Day' ? 2 : 1;

        liveSharingModeBadge.textContent = settings.sharingMode === 'equal' ? 'Equal Split' : 
                                          (settings.sharingMode === 'passenger-only' ? 'Passenger Only' : 'Distance Based');
        
        if (status !== 'Completed') {
            calcFuelUsed.textContent = '0.00 L';
            calcFuelCost.textContent = '₹0.00';
            calcRatePerKm.textContent = `₹${ratePerKm.toFixed(2)}/km`;
            calcShares.innerHTML = `<span class="text-muted fst-italic">No charge applicable for ${status} status</span>`;
            return;
        }
        
        const fuelUsed = CarpoolApp.calculateFuelUsed(distance, mileage);
        const fuelCost = CarpoolApp.calculateFuelCost(distance, mileage, petrolPrice);
        
        calcFuelUsed.textContent = fuelUsed.toFixed(2) + ' L';
        calcFuelCost.textContent = CarpoolApp.formatCurrency(fuelCost);
        calcRatePerKm.textContent = `₹${ratePerKm.toFixed(2)}/km`;
        
        const selectedPassengerIds = getSelectedPassengers();
        if (selectedPassengerIds.length === 0) {
            calcShares.innerHTML = '<span class="text-muted small">No passengers selected</span>';
            return;
        }
        
        const customData = { passengerDistances: {} };
        selectedPassengerIds.forEach(pid => {
            const distInp = document.getElementById(`paxDist_${pid}`);
            const manualVal = distInp ? parseFloat(distInp.value) || 0 : 0;
            customData.passengerDistances[pid] = manualVal * multiplier;
        });
        
        const shares = CarpoolApp.calculateShares(fuelCost, selectedPassengerIds, settings.sharingMode || 'distance', customData, {
            ratePerKm: ratePerKm,
            petrolPrice: petrolPrice,
            mileage: mileage,
            actualDistance: distance
        });
        
        let sharesHtml = '<div class="d-flex flex-column gap-1">';
        for (const [id, amount] of Object.entries(shares)) {
            const p = passengers.find(x => x.id === id);
            const name = p ? p.name : id;
            const distInp = document.getElementById(`paxDist_${id}`);
            const baseDist = distInp ? parseFloat(distInp.value) || 0 : 0;
            const chargeableDist = baseDist * multiplier;

            sharesHtml += `
                <div class="d-flex justify-content-between align-items-center">
                    <span>
                        <strong>${CarpoolApp.escapeHtml(name)}</strong> 
                        <span class="badge bg-light text-muted border ms-1">${chargeableDist.toFixed(1)} km</span>
                    </span>
                    <strong class="text-primary">${CarpoolApp.formatCurrency(amount)}</strong>
                </div>
            `;
        }
        sharesHtml += '</div>';
        calcShares.innerHTML = sharesHtml;
    }
    
    async function handleSaveTrip(e) {
        e.preventDefault();
        
        const date = tripDate.value;
        const type = getSelectedTripType();
        const status = getSelectedStatus();
        const selectedPassengers = getSelectedPassengers();
        const distance = parseFloat(tripDistance.value) || 0;
        
        if (!date || !type || !status) {
            CarpoolApp.showToast('Please fill all required fields.', 'danger');
            return;
        }
        
        if (status === 'Completed' && selectedPassengers.length === 0) {
             CarpoolApp.showToast('Please select at least one passenger for a completed trip.', 'warning');
             return;
        }
        
        settings = CarpoolApp.getSettings();
        driver = CarpoolApp.getDriver();
        const petrolPrice = settings.petrolPrice || 105;
        const mileage = settings.mileage || 12;
        const ratePerKm = CarpoolApp.calculateRatePerKm(petrolPrice, mileage);

        let fuelUsed = 0;
        let fuelCost = 0;
        let passengerDetails = {};
        let passengerShares = {};
        const multiplier = type === 'Full Day' ? 2 : 1;
        
        if (status === 'Completed') {
            fuelUsed = CarpoolApp.calculateFuelUsed(distance, mileage);
            fuelCost = CarpoolApp.calculateFuelCost(distance, mileage, petrolPrice);
            
            const customData = { passengerDistances: {} };
            selectedPassengers.forEach(pid => {
                const p = passengers.find(x => x.id === pid);
                const distInp = document.getElementById(`paxDist_${pid}`);
                const manualBaseDist = distInp ? parseFloat(distInp.value) || (p?.pickupDistance || p?.distance || 10) : 10;
                const finalDist = parseFloat((manualBaseDist * multiplier).toFixed(1));
                
                customData.passengerDistances[pid] = finalDist;

                const amt = parseFloat((finalDist * ratePerKm).toFixed(2));
                passengerDetails[pid] = {
                    passengerId: pid,
                    passengerName: p ? p.name : pid,
                    pickupLocation: p?.pickupLocation || `${p?.name} Pickup`,
                    pickupOrder: selectedPassengers.indexOf(pid) + 1,
                    calculatedPickupDistance: p?.distance || 10,
                    manualPickupDistance: manualBaseDist,
                    finalPickupDistance: finalDist,
                    distanceSource: 'manual',
                    chargeableDistance: finalDist,
                    ratePerKm: ratePerKm,
                    amount: amt
                };
            });

            passengerShares = CarpoolApp.calculateShares(fuelCost, selectedPassengers, settings.sharingMode || 'distance', customData, {
                ratePerKm: ratePerKm,
                petrolPrice: petrolPrice,
                mileage: mileage,
                actualDistance: distance
            });

            // Sync amounts in passengerDetails with computed shares
            for (let pid in passengerShares) {
                if (passengerDetails[pid]) {
                    passengerDetails[pid].amount = passengerShares[pid];
                }
            }
        }
        
        const tripData = {
            date,
            type,
            status,
            driverId: driver ? driver.id : 'vivek',
            driverName: driver ? driver.name : 'Vivek',
            passengers: selectedPassengers,
            passengerDetails: passengerDetails,
            actualRouteDistance: distance,
            actualDistance: distance,
            finalRouteDistance: distance,
            distanceSource: overrideDistance.checked ? 'manual' : 'calculated',
            fuelUsed,
            fuelCost,
            ratePerKm,
            petrolPrice,
            mileage,
            passengerShares,
            sharingMode: settings.sharingMode || 'distance',
            notes: tripNotes.value.trim()
        };
        
        const id = tripIdInput.value;
        try {
            saveTripBtn.disabled = true;
            if (id) {
                await CarpoolApp.updateTrip(id, tripData);
                CarpoolApp.showToast('Trip updated successfully.', 'success');
            } else {
                await CarpoolApp.saveTrip(tripData);
                CarpoolApp.showToast('Trip logged successfully.', 'success');
            }
            resetForm();
            loadTrips();
        } catch (error) {
            console.error('Error saving trip:', error);
            CarpoolApp.showToast('Error saving trip.', 'danger');
        } finally {
            saveTripBtn.disabled = false;
        }
    }
    
    function resetForm() {
        tripIdInput.value = '';
        formTitle.textContent = 'Log Daily Trip';
        saveTripBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i> Save Trip';
        cancelEditBtn.classList.add('d-none');
        
        tripForm.reset();
        tripDate.value = CarpoolApp.formatDateISO(new Date());
        document.getElementById('typeFullDay').checked = true;
        document.getElementById('statusCompleted').checked = true;
        
        overrideDistance.checked = false;
        tripDistance.readOnly = true;
        
        renderPassengers();
        calculateDistance();
        updateCalculations();
    }
    
    async function loadTrips() {
        tripsTableBody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div> Loading trips...</td></tr>';
        
        const m = parseInt(filterMonth.value);
        const y = parseInt(filterYear.value);
        const p = filterPassenger.value;
        const s = filterStatus.value;
        
        try {
            const trips = await CarpoolApp.getTrips({
                month: m,
                year: y,
                passenger: p,
                status: s
            });
            
            if (trips.length === 0) {
                tripsTableBody.innerHTML = '';
                emptyState.classList.remove('d-none');
                return;
            }
            
            emptyState.classList.add('d-none');
            let html = '';
            
            trips.forEach(trip => {
                const statusBadge = getStatusBadge(trip.status);
                
                // Render passenger badges with individual distances
                let paxBadges = '<span class="text-muted small">—</span>';
                if (trip.passengers && trip.passengers.length > 0) {
                    paxBadges = trip.passengers.map(pid => {
                        let name = pid;
                        let distStr = '';
                        if (trip.passengerDetails && trip.passengerDetails[pid]) {
                            name = trip.passengerDetails[pid].passengerName || pid;
                            distStr = ` (${trip.passengerDetails[pid].chargeableDistance}km)`;
                        } else {
                            const pObj = passengers.find(x => x.id === pid);
                            if (pObj) {
                                name = pObj.name;
                                distStr = ` (${pObj.pickupDistance || pObj.distance || 10}km)`;
                            }
                        }
                        const shareAmt = trip.passengerShares && trip.passengerShares[pid] ? ` • ₹${trip.passengerShares[pid]}` : '';
                        return `<span class="badge bg-light text-dark border me-1 mb-1">${CarpoolApp.escapeHtml(name)}${distStr}${shareAmt}</span>`;
                    }).join('');
                }
                
                html += `
                    <tr>
                        <td class="fw-semibold">${CarpoolApp.formatDate(trip.date)}</td>
                        <td><span class="badge bg-secondary rounded-pill px-2">${CarpoolApp.escapeHtml(trip.type)}</span></td>
                        <td><div class="d-flex flex-wrap">${paxBadges}</div></td>
                        <td><strong>${trip.actualRouteDistance || trip.actualDistance || 0} km</strong></td>
                        <td class="text-primary fw-bold">${CarpoolApp.formatCurrency(trip.fuelCost || 0)}</td>
                        <td>${statusBadge}</td>
                        <td class="text-end">
                            <button class="btn btn-sm btn-outline-primary rounded-pill me-1 edit-trip-btn" data-id="${trip.id}">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger rounded-pill delete-trip-btn" data-id="${trip.id}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            tripsTableBody.innerHTML = html;
            
            // Attach Action Listeners
            document.querySelectorAll('.edit-trip-btn').forEach(btn => {
                btn.addEventListener('click', (e) => editTrip(e.currentTarget.dataset.id));
            });
            document.querySelectorAll('.delete-trip-btn').forEach(btn => {
                btn.addEventListener('click', (e) => showDeleteModal(e.currentTarget.dataset.id));
            });
            
        } catch (error) {
            console.error('Error rendering trips:', error);
            tripsTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-3">Failed to load trips.</td></tr>';
        }
    }
    
    function getStatusBadge(status) {
        switch(status) {
            case 'Completed': return '<span class="badge bg-success rounded-pill px-2">Completed</span>';
            case 'Cancelled': return '<span class="badge bg-danger rounded-pill px-2">Cancelled</span>';
            case 'WFH': return '<span class="badge rounded-pill px-2" style="background-color: #7209b7; color: white;">WFH</span>';
            case 'Leave': return '<span class="badge bg-warning rounded-pill px-2 text-dark">Leave</span>';
            case 'No Carpool': return '<span class="badge bg-secondary rounded-pill px-2">No Carpool</span>';
            default: return `<span class="badge bg-light text-dark border rounded-pill px-2">${CarpoolApp.escapeHtml(status || 'Completed')}</span>`;
        }
    }
    
    async function editTrip(id) {
        const trip = await CarpoolApp.getTrip(id);
        if (!trip) {
            CarpoolApp.showToast('Trip record not found.', 'danger');
            return;
        }
        
        tripIdInput.value = trip.id;
        tripDate.value = trip.date;
        tripNotes.value = trip.notes || '';
        
        const typeRadio = document.querySelector(`input[name="tripType"][value="${trip.type}"]`);
        if (typeRadio) typeRadio.checked = true;
        
        const statusRadio = document.querySelector(`input[name="tripStatus"][value="${trip.status}"]`);
        if (statusRadio) statusRadio.checked = true;
        
        renderPassengers(trip.passengerDetails);
        
        // Check matching passenger checkboxes
        if (trip.passengers && Array.isArray(trip.passengers)) {
            trip.passengers.forEach(pid => {
                const cb = document.getElementById(`chk_${pid}`);
                if (cb) {
                    cb.checked = true;
                    const card = document.getElementById(`paxCard_${pid}`);
                    if (card) card.classList.add('selected');
                }
            });
        }
        
        tripDistance.value = trip.actualRouteDistance || trip.actualDistance || 0;
        overrideDistance.checked = (trip.distanceSource === 'manual' || trip.distanceSource === 'gps_live');
        tripDistance.readOnly = !overrideDistance.checked;
        
        formTitle.textContent = 'Edit Trip Record';
        saveTripBtn.innerHTML = '<i class="bi bi-save me-1"></i> Update Trip';
        cancelEditBtn.classList.remove('d-none');
        
        updateCalculations();
        
        // Smooth scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    function showDeleteModal(id) {
        tripToDelete = id;
        deleteModal.show();
    }
    
    async function confirmDelete() {
        if (!tripToDelete) return;
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        confirmBtn.disabled = true;
        
        try {
            await CarpoolApp.deleteTrip(tripToDelete);
            deleteModal.hide();
            tripToDelete = null;
            loadTrips();
        } catch (error) {
            console.error('Delete trip error:', error);
        } finally {
            confirmBtn.disabled = false;
        }
    }

    init();
});
