CarpoolApp.init('calendar', async function() {
    
    const currentMonthDisplay = document.getElementById('currentMonthDisplay');
    const calendarDays = document.getElementById('calendarDays');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    
    let currentDate = new Date(); // Use actual current date as default
    // Using system time to set context accurately if needed. Assuming user requested specific times contextually? Let's just use real current date, or a passed default.
    // Setting up month/year tracking
    let displayMonth = currentDate.getMonth();
    let displayYear = currentDate.getFullYear();
    
    let tripsMap = {};
    let passengers = CarpoolApp.getPassengers();
    const driver = CarpoolApp.getDriver();
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
        
        // Load trips for the month
        const trips = await CarpoolApp.getTrips({month: displayMonth, year: displayYear});
        
        // Build map for quick lookup: date string (YYYY-MM-DD) -> trip object
        tripsMap = {};
        trips.forEach(trip => {
            tripsMap[trip.date] = trip;
        });
        
        calendarDays.innerHTML = '';
        
        const firstDay = new Date(displayYear, displayMonth, 1).getDay(); // 0-6 (Sun-Sat)
        const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
        
        const today = new Date();
        const todayStr = CarpoolApp.formatDateISO(today);
        
        // Padding days
        for (let i = 0; i < firstDay; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'calendar-day empty';
            calendarDays.appendChild(emptyDiv);
        }
        
        // Days
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
        return 'trip'; // default completed
    }
    
    function showDayDetails(dateStr, trip) {
        document.getElementById('dayModalTitle').textContent = CarpoolApp.formatDate(dateStr);
        
        const modalBody = document.getElementById('dayModalBody');
        const modalFooter = document.getElementById('dayModalFooter');
        
        if (!trip) {
            modalBody.innerHTML = `
                <div class="text-center py-4">
                    <i class="bi bi-calendar-x text-muted mb-2" style="font-size: 2rem;"></i>
                    <p class="mb-0 text-muted">No trip recorded for this day.</p>
                </div>
            `;
            modalFooter.innerHTML = `
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                <a href="trips.html" class="btn btn-primary">Add Trip</a>
            `;
        } else {
            let passHtml = '<div class="text-muted small mb-1">No passengers</div>';
            if (trip.passengers && trip.passengers.length > 0) {
                passHtml = '<ul class="list-group list-group-flush mb-0">';
                trip.passengers.forEach(pid => {
                    const p = passengers.find(x => x.id === pid);
                    const name = p ? p.name : 'Unknown';
                    const share = (trip.passengerShares && trip.passengerShares[pid]) || 0;
                    passHtml += `
                        <li class="list-group-item d-flex justify-content-between px-0 py-1 border-0 bg-transparent">
                            <span>${CarpoolApp.escapeHtml(name)}</span>
                            <strong>${CarpoolApp.formatCurrency(share)}</strong>
                        </li>
                    `;
                });
                passHtml += '</ul>';
            }

            modalBody.innerHTML = `
                <div class="mb-3 d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span class="fw-bold">Status:</span>
                    <span class="badge ${getStatusBadge(trip.status)}">${CarpoolApp.escapeHtml(trip.status || 'Completed')}</span>
                </div>
                <div class="mb-3 d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span class="fw-bold">Type:</span>
                    <span>${CarpoolApp.escapeHtml(trip.type || 'N/A')}</span>
                </div>
                <div class="mb-3 d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span class="fw-bold">Distance:</span>
                    <span>${trip.actualDistance || 0} km</span>
                </div>
                <div class="mb-3 d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span class="fw-bold">Fuel Used:</span>
                    <span>${(trip.fuelUsed || 0).toFixed(2)} L</span>
                </div>
                <div class="mb-3 d-flex justify-content-between align-items-center border-bottom pb-2">
                    <span class="fw-bold text-primary">Total Fuel Cost:</span>
                    <strong class="text-primary">${CarpoolApp.formatCurrency(trip.fuelCost || 0)}</strong>
                </div>
                <div class="mt-4">
                    <h6 class="fw-bold border-bottom pb-1 mb-2">Passengers & Shares</h6>
                    ${passHtml}
                </div>
                ${trip.notes ? `
                    <div class="mt-4 bg-light p-2 rounded small">
                        <strong>Notes:</strong><br/>${CarpoolApp.escapeHtml(trip.notes)}
                    </div>
                ` : ''}
            `;
            modalFooter.innerHTML = `
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                <a href="trips.html" class="btn btn-outline-primary">Manage Trips</a>
            `;
        }
        
        dayModal.show();
    }
    
    function getStatusBadge(status) {
        switch(status) {
            case 'Completed': return 'bg-success';
            case 'Cancelled': return 'bg-danger';
            case 'WFH': return 'bg-info text-dark';
            case 'Leave': return 'bg-warning text-dark';
            case 'No Carpool': return 'bg-secondary';
            default: return 'bg-secondary';
        }
    }

    init();
});
