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
    const calcShares = document.getElementById('calcShares');
    
    // History Elements
    const tripsTableBody = document.getElementById('tripsTableBody');
    const emptyState = document.getElementById('emptyState');
    const filterMonth = document.getElementById('filterMonth');
    const filterYear = document.getElementById('filterYear');
    const filterPassenger = document.getElementById('filterPassenger');
    const filterStatus = document.getElementById('filterStatus');
    
    // Edit/Delete
    const tripIdInput = document.getElementById('tripId');
    const saveTripBtn = document.getElementById('saveTripBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const formTitle = document.getElementById('formTitle');
    
    let deleteModal;
    let tripToDelete = null;

    // State
    const settings = CarpoolApp.getSettings();
    const driver = CarpoolApp.getDriver();
    let passengers = CarpoolApp.getPassengers();
    
    function init() {
        // Init Date to today
        if(!tripDate.value) tripDate.value = CarpoolApp.formatDateISO(new Date());
        
        // Populate Passengers in form and filter
        renderPassengers();
        
        // Populate Filters
        populateDateFilters();
        
        // Modals
        deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
        document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
        
        // Event Listeners
        tripForm.addEventListener('submit', handleSaveTrip);
        cancelEditBtn.addEventListener('click', resetForm);
        overrideDistance.addEventListener('change', () => {
            tripDistance.readOnly = !overrideDistance.checked;
            if(!overrideDistance.checked) calculateDistance();
            updateCalculations();
        });
        tripDistance.addEventListener('input', updateCalculations);
        tripDate.addEventListener('change', updateCalculations);
        
        Array.from(tripTypeRadios).forEach(radio => radio.addEventListener('change', () => {
            if(!overrideDistance.checked) calculateDistance();
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
        loadTrips();
    }
    
    function renderPassengers() {
        passengersContainer.innerHTML = '';
        filterPassenger.innerHTML = '<option value="">All Passengers</option>';
        
        if (passengers.length === 0) {
            passengersContainer.innerHTML = '<span class="text-muted small">No active passengers found.</span>';
            return;
        }

        passengers.forEach(p => {
            // Form checkbox
            const div = document.createElement('div');
            div.className = 'form-check passenger-check';
            div.innerHTML = `
                <input class="form-check-input passenger-checkbox" type="checkbox" value="${p.id}" id="chk_${p.id}">
                <label class="form-check-label" for="chk_${p.id}">
                    ${CarpoolApp.escapeHtml(p.name)} <small class="text-muted">(${p.distance || 0}km)</small>
                </label>
            `;
            passengersContainer.appendChild(div);
            
            // Listen to checkbox changes for live calc
            div.querySelector('input').addEventListener('change', updateCalculations);
            
            // Filter option
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
        
        // Months
        CarpoolApp.MONTHS.forEach((month, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.textContent = month;
            if (index === currentMonth) opt.selected = true;
            filterMonth.appendChild(opt);
        });
        
        // Years (Current year +/- 2 years)
        for (let y = currentYear - 2; y <= currentYear + 2; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === currentYear) opt.selected = true;
            filterYear.appendChild(opt);
        }
    }
    
    function getSelectedTripType() {
        return document.querySelector('input[name="tripType"]:checked').value;
    }
    
    function getSelectedStatus() {
        return document.querySelector('input[name="tripStatus"]:checked').value;
    }
    
    function getSelectedPassengers() {
        return Array.from(document.querySelectorAll('.passenger-checkbox:checked')).map(cb => cb.value);
    }
    
    function calculateDistance() {
        const type = getSelectedTripType();
        const defaultDist = CarpoolApp.getDefaultDistance(type, driver ? driver.distance : 0);
        tripDistance.value = defaultDist;
    }
    
    function updateCalculations() {
        const distance = parseFloat(tripDistance.value) || 0;
        const status = getSelectedStatus();
        
        if (status !== 'Completed') {
            calcFuelUsed.textContent = '0.00 L';
            calcFuelCost.textContent = '₹0.00';
            calcShares.innerHTML = '<span class="text-muted">N/A for ' + status + ' trips</span>';
            return;
        }
        
        const fuelUsed = CarpoolApp.calculateFuelUsed(distance, settings.mileage);
        const fuelCost = CarpoolApp.calculateFuelCost(distance, settings.mileage, settings.petrolPrice);
        
        calcFuelUsed.textContent = fuelUsed.toFixed(2) + ' L';
        calcFuelCost.textContent = CarpoolApp.formatCurrency(fuelCost);
        
        const selectedPassengerIds = getSelectedPassengers();
        if (selectedPassengerIds.length === 0) {
            calcShares.innerHTML = '<span class="text-muted">No passengers selected</span>';
            return;
        }
        
        const customData = {};
        if (settings.sharingMode === 'Distance-based') {
            selectedPassengerIds.forEach(id => {
                const p = passengers.find(x => x.id === id);
                if (p) customData[id] = p.distance || 0;
            });
            if (driver) customData[driver.id] = driver.distance || 0;
        }
        
        const shares = CarpoolApp.calculateShares(fuelCost, selectedPassengerIds, settings.sharingMode, customData);
        
        let sharesHtml = '<div class="d-flex flex-column gap-1">';
        for (const [id, amount] of Object.entries(shares)) {
            let name = id;
            if (id === driver?.id) {
                name = driver.name + ' (Driver)';
            } else {
                const p = passengers.find(x => x.id === id);
                if (p) name = p.name;
            }
            sharesHtml += `<div class="d-flex justify-content-between text-muted"><span>${CarpoolApp.escapeHtml(name)}</span><span>${CarpoolApp.formatCurrency(amount)}</span></div>`;
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
        
        let fuelUsed = 0;
        let fuelCost = 0;
        let passengerShares = {};
        
        if (status === 'Completed') {
            fuelUsed = CarpoolApp.calculateFuelUsed(distance, settings.mileage);
            fuelCost = CarpoolApp.calculateFuelCost(distance, settings.mileage, settings.petrolPrice);
            
            const customData = {};
            if (settings.sharingMode === 'Distance-based') {
                selectedPassengers.forEach(id => {
                    const p = passengers.find(x => x.id === id);
                    if (p) customData[id] = p.distance || 0;
                });
                if (driver) customData[driver.id] = driver.distance || 0;
            }
            passengerShares = CarpoolApp.calculateShares(fuelCost, selectedPassengers, settings.sharingMode, customData);
        }
        
        const tripData = {
            date,
            type,
            status,
            passengers: selectedPassengers,
            actualDistance: distance,
            fuelUsed,
            fuelCost,
            passengerShares,
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
            CarpoolApp.showToast('Error saving trip. Check console.', 'danger');
        } finally {
            saveTripBtn.disabled = false;
        }
    }
    
    function resetForm() {
        tripIdInput.value = '';
        formTitle.textContent = 'Log New Trip';
        saveTripBtn.innerHTML = '<i class="bi bi-check-circle"></i> Save Trip';
        cancelEditBtn.classList.add('d-none');
        
        tripForm.reset();
        tripDate.value = CarpoolApp.formatDateISO(new Date());
        document.getElementById('typeFullDay').checked = true;
        document.getElementById('statusCompleted').checked = true;
        
        overrideDistance.checked = false;
        tripDistance.readOnly = true;
        
        calculateDistance();
        updateCalculations();
        
        // Scroll to form if on mobile
        if(window.innerWidth < 992) {
             const collapse = bootstrap.Collapse.getInstance(document.getElementById('tripFormCard'));
             if(!collapse) {
                 new bootstrap.Collapse(document.getElementById('tripFormCard'), {toggle: false}).show();
             } else {
                 collapse.show();
             }
        }
    }
    
    function getStatusBadgeClass(status) {
        switch(status) {
            case 'Completed': return 'bg-success';
            case 'Cancelled': return 'bg-danger';
            case 'WFH': return 'bg-info text-dark';
            case 'Leave': return 'bg-warning text-dark';
            case 'No Carpool': return 'bg-secondary';
            default: return 'bg-secondary';
        }
    }
    
    async function loadTrips() {
        const month = parseInt(filterMonth.value);
        const year = parseInt(filterYear.value);
        const passenger = filterPassenger.value;
        const status = filterStatus.value;
        
        const trips = await CarpoolApp.getTrips({
            month, 
            year,
            passenger: passenger || null,
            status: status || null
        });
        
        tripsTableBody.innerHTML = '';
        
        if (trips.length === 0) {
            emptyState.classList.remove('d-none');
            document.querySelector('.table-container').classList.add('d-none');
            return;
        }
        
        emptyState.classList.add('d-none');
        document.querySelector('.table-container').classList.remove('d-none');
        
        // Sort descending by date
        trips.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        trips.forEach(trip => {
            const tr = document.createElement('tr');
            
            // Passengers badges
            let passengersHtml = '';
            if (trip.passengers && trip.passengers.length > 0) {
                passengersHtml = trip.passengers.map(pid => {
                    const p = passengers.find(x => x.id === pid);
                    return `<span class="badge bg-light text-dark border me-1">${p ? CarpoolApp.escapeHtml(p.name) : 'Unknown'}</span>`;
                }).join('');
            } else {
                passengersHtml = '<span class="text-muted small">None</span>';
            }
            
            const badgeClass = getStatusBadgeClass(trip.status);
            
            tr.innerHTML = `
                <td class="text-nowrap">${CarpoolApp.formatDate(trip.date)}</td>
                <td>${CarpoolApp.escapeHtml(trip.type || 'N/A')}</td>
                <td>${passengersHtml}</td>
                <td>${trip.actualDistance || 0} km</td>
                <td>${CarpoolApp.formatCurrency(trip.fuelCost || 0)}</td>
                <td><span class="badge ${badgeClass}">${CarpoolApp.escapeHtml(trip.status || 'Completed')}</span></td>
                <td class="text-end text-nowrap">
                    <button class="btn btn-sm btn-outline-primary me-1 edit-btn" data-id="${trip.id}" title="Edit">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${trip.id}" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            
            tripsTableBody.appendChild(tr);
        });
        
        // Attach listeners
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => editTrip(e.currentTarget.dataset.id));
        });
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => promptDelete(e.currentTarget.dataset.id));
        });
    }
    
    async function editTrip(id) {
        const trip = await CarpoolApp.getTrip(id);
        if (!trip) return;
        
        tripIdInput.value = trip.id;
        tripDate.value = trip.date;
        
        const typeRadio = document.querySelector(`input[name="tripType"][value="${trip.type}"]`);
        if(typeRadio) typeRadio.checked = true;
        
        const statusRadio = document.querySelector(`input[name="tripStatus"][value="${trip.status || 'Completed'}"]`);
        if(statusRadio) statusRadio.checked = true;
        
        // Clear checkboxes
        document.querySelectorAll('.passenger-checkbox').forEach(cb => cb.checked = false);
        // Set checked
        if (trip.passengers) {
            trip.passengers.forEach(pid => {
                const cb = document.getElementById(`chk_${pid}`);
                if (cb) cb.checked = true;
            });
        }
        
        tripDistance.value = trip.actualDistance || 0;
        overrideDistance.checked = true;
        tripDistance.readOnly = false;
        
        tripNotes.value = trip.notes || '';
        
        formTitle.textContent = 'Edit Trip';
        saveTripBtn.innerHTML = '<i class="bi bi-check-circle"></i> Update Trip';
        cancelEditBtn.classList.remove('d-none');
        
        updateCalculations();
        
        // Scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if(window.innerWidth < 992) {
             const collapse = bootstrap.Collapse.getInstance(document.getElementById('tripFormCard'));
             if(!collapse) {
                 new bootstrap.Collapse(document.getElementById('tripFormCard'), {toggle: false}).show();
             } else {
                 collapse.show();
             }
        }
    }
    
    function promptDelete(id) {
        tripToDelete = id;
        deleteModal.show();
    }
    
    async function confirmDelete() {
        if (!tripToDelete) return;
        
        try {
            await CarpoolApp.deleteTrip(tripToDelete);
            CarpoolApp.showToast('Trip deleted successfully.', 'success');
            loadTrips();
        } catch (error) {
            console.error('Error deleting trip:', error);
            CarpoolApp.showToast('Error deleting trip.', 'danger');
        } finally {
            deleteModal.hide();
            tripToDelete = null;
        }
    }
    
    init();
});
