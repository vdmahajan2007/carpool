// ============================================================
// js/calendar.js — Monthly Calendar View Logic
// ============================================================

CarpoolApp.init('calendar', async function() {
    const currentMonthDisplay = document.getElementById('currentMonthDisplay');
    const calendarDays = document.getElementById('calendarDays');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    
    let currentDate = new Date();
    let displayMonth = currentDate.getMonth();
    let displayYear = currentDate.getFullYear();
    
    let tripsMap = {};
    let dayModal;

    function init() {
        dayModal = new bootstrap.Modal(document.getElementById('dayModal'));
        
        prevMonthBtn.addEventListener('click', () => changeMonth(-1));
        nextMonthBtn.addEventListener('click', () => changeMonth(1));
        
        renderCalendar();
    }
    
    function changeMonth(offset) {
        displayMonth += offset;
        if (displayMonth < 0) {
            displayMonth = 11;
            displayYear--;
        } else if (displayMonth > 11) {
            displayMonth = 0;
            displayYear++;
        }
        renderCalendar();
    }
    
    async function renderCalendar() {
        currentMonthDisplay.textContent = `${CarpoolApp.MONTHS[displayMonth]} ${displayYear}`;
        
        const trips = await CarpoolApp.getTrips({ month: displayMonth, year: displayYear });
        
        tripsMap = {};
        trips.forEach(trip => {
            tripsMap[trip.date] = trip;
        });
        
        calendarDays.innerHTML = '';
        
        const firstDay = new Date(displayYear, displayMonth, 1).getDay();
        const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
        
        const today = new Date();
        const todayStr = CarpoolApp.formatDateISO(today);
        
        // Padding days before start of month
        for (let i = 0; i < firstDay; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'calendar-day empty';
            calendarDays.appendChild(emptyDiv);
        }
        
        // Days of month
        for (let day = 1; day <= daysInMonth; day++) {
            const dateObj = new Date(displayYear, displayMonth, day);
            const dateStr = CarpoolApp.formatDateISO(dateObj);
            
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            if (dateStr === todayStr) dayDiv.classList.add('today');
            
            const dayNum = document.createElement('div');
            dayNum.className = 'day-number';
            dayNum.textContent = day;
            
            const indicator = document.createElement('div');
            indicator.className = 'day-indicator';
            
            const trip = tripsMap[dateStr];
            if (trip) {
                indicator.classList.add(getIndicatorClass(trip));
            } else {
                indicator.classList.add('no-trip');
            }
            
            dayDiv.appendChild(dayNum);
            dayDiv.appendChild(indicator);
            
            dayDiv.addEventListener('click', () => showDayDetails(dateStr, trip));
            
            calendarDays.appendChild(dayDiv);
        }
    }
    
    function getIndicatorClass(trip) {
        if (trip.status === 'Cancelled') return 'cancelled';
        if (trip.status === 'WFH') return 'wfh';
        if (trip.status === 'Leave') return 'leave';
        if (trip.status === 'No Carpool') return 'nocarpool';
        if (trip.type === 'Office' || trip.type === 'Return') return 'partial';
        return 'trip';
    }
    
    function showDayDetails(dateStr, trip) {
        document.getElementById('dayModalTitle').textContent = CarpoolApp.formatDate(dateStr);
        
        const modalBody = document.getElementById('dayModalBody');
        const modalFooter = document.getElementById('dayModalFooter');
        const passengers = CarpoolApp.getPassengers();
        
        if (!trip) {
            modalBody.innerHTML = `
                <div class="text-center py-4">
                    <i class="bi bi-calendar-x text-muted mb-2" style="font-size: 2.5rem;"></i>
                    <p class="mb-0 text-muted">No trip recorded for this day.</p>
                </div>
            `;
            modalFooter.innerHTML = `
                <button type="button" class="btn btn-light rounded-pill px-3" data-bs-dismiss="modal">Close</button>
                <a href="trips.html" class="btn btn-primary rounded-pill px-4">Log Trip</a>
            `;
        } else {
            let passHtml = '';
            
            // Driver Share row
            const dName = trip.driverName || 'Vivek';
            const dCost = trip.driverContribution !== undefined ? trip.driverContribution : (trip.fuelCost || 0);
            passHtml += `
                <li class="list-group-item d-flex justify-content-between align-items-center px-0 py-2 border-0 bg-transparent border-bottom">
                    <span><i class="bi bi-steering-wheel text-primary me-1"></i> <strong>${CarpoolApp.escapeHtml(dName)}</strong> <span class="badge bg-primary text-white ms-1">Driver</span></span>
                    <strong class="text-primary">${CarpoolApp.formatCurrency(dCost)}</strong>
                </li>
            `;

            if (trip.passengers && trip.passengers.length > 0) {
                trip.passengers.forEach(pid => {
                    const p = passengers.find(x => x.id === pid);
                    const name = p ? p.name : (trip.passengerDetails?.[pid]?.passengerName || pid);
                    const dist = trip.passengerDetails?.[pid]?.chargeableDistance || p?.pickupDistance || p?.distance || '';
                    const distText = dist ? ` (${dist} km)` : '';
                    const share = (trip.passengerShares && trip.passengerShares[pid]) || 0;
                    passHtml += `
                        <li class="list-group-item d-flex justify-content-between align-items-center px-0 py-2 border-0 bg-transparent">
                            <span><i class="bi bi-person-fill text-secondary me-1"></i> <strong>${CarpoolApp.escapeHtml(name)}</strong><span class="text-muted small">${distText}</span></span>
                            <strong class="text-success">${CarpoolApp.formatCurrency(share)}</strong>
                        </li>
                    `;
                });
            } else {
                passHtml += '<li class="list-group-item px-0 py-2 border-0 bg-transparent text-muted small">No passengers recorded.</li>';
            }

            modalBody.innerHTML = `
                <div class="mb-2 d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span class="fw-bold text-muted small">Status:</span>
                    <span class="badge ${getStatusBadge(trip.status)} rounded-pill px-3 py-1">${CarpoolApp.escapeHtml(trip.status || 'Completed')}</span>
                </div>
                <div class="mb-2 d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span class="fw-bold text-muted small">Trip Type:</span>
                    <span class="fw-bold">${CarpoolApp.escapeHtml(trip.type || 'N/A')}</span>
                </div>
                <div class="mb-2 d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span class="fw-bold text-muted small">Car Route Distance:</span>
                    <span class="fw-bold">${trip.actualRouteDistance || trip.actualDistance || 0} km</span>
                </div>
                <div class="mb-2 d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span class="fw-bold text-muted small">Fuel Used:</span>
                    <span>${(trip.fuelUsed || 0).toFixed(2)} L</span>
                </div>
                <div class="mb-3 d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span class="fw-bold text-muted small">Total Trip Cost:</span>
                    <strong class="text-primary fs-6">${CarpoolApp.formatCurrency(trip.fuelCost || 0)}</strong>
                </div>
                <div class="bg-light p-3 rounded-3 mb-2">
                    <h6 class="fw-bold mb-2 small text-muted text-uppercase">People & Contributions</h6>
                    <ul class="list-group list-group-flush mb-0">
                        ${passHtml}
                    </ul>
                </div>
                ${trip.notes ? `
                    <div class="bg-light p-2 rounded-3 small text-muted">
                        <strong>Notes:</strong> ${CarpoolApp.escapeHtml(trip.notes)}
                    </div>
                ` : ''}
            `;
            modalFooter.innerHTML = `
                <button type="button" class="btn btn-light rounded-pill px-3" data-bs-dismiss="modal">Close</button>
                <a href="trips.html" class="btn btn-outline-primary rounded-pill px-3">Manage in Trips</a>
            `;
        }
        
        dayModal.show();
    }
    
    function getStatusBadge(status) {
        switch(status) {
            case 'Completed': return 'bg-success';
            case 'Cancelled': return 'bg-danger';
            case 'WFH': return 'bg-purple text-white';
            case 'Leave': return 'bg-warning text-dark';
            case 'No Carpool': return 'bg-secondary';
            default: return 'bg-secondary';
        }
    }

    init();
});
