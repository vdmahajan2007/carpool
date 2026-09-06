// ============================================================
// js/settlement.js — Monthly Settlement & Payments Logic
// ============================================================

CarpoolApp.init('settlement', async function() {
    let currentMonth = new Date().getMonth(); // 0-11
    let currentYear = new Date().getFullYear();
    let paymentModal;
    let deletePaymentModal;
    let paymentToDelete = null;

    // Initialize Selectors
    const monthSelect = document.getElementById('monthSelect');
    const yearSelect = document.getElementById('yearSelect');
    
    CarpoolApp.MONTHS.forEach((month, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = month;
        monthSelect.appendChild(option);
    });

    for (let y = currentYear - 2; y <= currentYear + 2; y++) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        yearSelect.appendChild(option);
    }

    monthSelect.value = currentMonth;
    yearSelect.value = currentYear;

    monthSelect.addEventListener('change', (e) => {
        currentMonth = parseInt(e.target.value);
        loadSettlements();
    });

    yearSelect.addEventListener('change', (e) => {
        currentYear = parseInt(e.target.value);
        loadSettlements();
    });

    paymentModal = new bootstrap.Modal(document.getElementById('paymentModal'));
    deletePaymentModal = new bootstrap.Modal(document.getElementById('deletePaymentModal'));

    document.getElementById('savePaymentBtn').addEventListener('click', savePaymentRecord);
    document.getElementById('exportBtn').addEventListener('click', exportSettlementData);
    document.getElementById('confirmDeletePaymentBtn').addEventListener('click', confirmDeletePayment);

    await loadSettlements();

    async function loadSettlements() {
        const container = document.getElementById('settlementsContainer');
        container.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>';

        try {
            const passengers = CarpoolApp.getPassengers();
            const driver = CarpoolApp.getDriver();
            const trips = await CarpoolApp.getTrips({ month: currentMonth, year: currentYear });
            
            if (passengers.length === 0) {
                container.innerHTML = '<div class="alert alert-info">No passengers found. Please add members in the People page first.</div>';
                return;
            }

            let totalMonthTripCost = 0;
            let totalMonthDistance = 0;
            let friendsTotalContribution = 0;
            let driverTotalContribution = 0;

            trips.forEach(t => {
                const cost = parseFloat(t.fuelCost || 0);
                const dist = parseFloat(t.actualRouteDistance || t.actualDistance || 0);
                totalMonthTripCost += cost;
                totalMonthDistance += dist;

                let tripFriends = 0;
                if (t.passengerShares) {
                    for (let pid in t.passengerShares) {
                        tripFriends += parseFloat(t.passengerShares[pid] || 0);
                    }
                }
                friendsTotalContribution += tripFriends;
                const dShare = t.driverContribution !== undefined 
                    ? parseFloat(t.driverContribution || 0) 
                    : Math.max(0, parseFloat((cost - tripFriends).toFixed(2)));
                driverTotalContribution += dShare;
            });

            // Summary Header Card
            let summaryCardHtml = `
                <div class="card shadow-sm border-0 rounded-4 bg-primary text-white mb-4">
                    <div class="card-body p-4">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="fw-bold mb-0"><i class="bi bi-pie-chart-fill me-2"></i>${CarpoolApp.MONTHS[currentMonth]} ${currentYear} Summary</h5>
                            <span class="badge bg-white text-primary rounded-pill px-3 py-1">Zero Profit Carpool</span>
                        </div>
                        <div class="row g-3 text-center">
                            <div class="col-6 col-md-3">
                                <div class="text-white-50 small">Total Car Distance</div>
                                <div class="fs-5 fw-bold">${totalMonthDistance.toFixed(1)} km</div>
                            </div>
                            <div class="col-6 col-md-3">
                                <div class="text-white-50 small">Total Trip Cost</div>
                                <div class="fs-5 fw-bold">${CarpoolApp.formatCurrency(totalMonthTripCost)}</div>
                            </div>
                            <div class="col-6 col-md-3">
                                <div class="text-white-50 small">Your Contribution</div>
                                <div class="fs-5 fw-bold">${CarpoolApp.formatCurrency(driverTotalContribution)}</div>
                            </div>
                            <div class="col-6 col-md-3">
                                <div class="text-white-50 small">Friends' Contribution</div>
                                <div class="fs-5 fw-bold text-warning">${CarpoolApp.formatCurrency(friendsTotalContribution)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            let html = '';
            
            for (const person of passengers) {
                // Filter trips where this passenger was present
                const pTrips = trips.filter(t => t.passengers && (t.passengers.includes(person.id) || t.passengers.includes(person.name)));
                
                const travelDays = new Set(pTrips.map(t => t.date)).size;
                
                // Calculate passenger's own cumulative chargeable distance
                const totalPassengerDistance = pTrips.reduce((sum, t) => {
                    if (t.passengerDetails && t.passengerDetails[person.id] && t.passengerDetails[person.id].chargeableDistance !== undefined) {
                        return sum + parseFloat(t.passengerDetails[person.id].chargeableDistance);
                    }
                    const defaultDist = person.pickupDistance !== undefined ? person.pickupDistance : (person.distance || 10);
                    const multiplier = t.type === 'Full Day' ? 2 : 1;
                    return sum + (defaultDist * multiplier);
                }, 0);
                
                // Sum passenger's individual fuel cost share
                const totalAmount = pTrips.reduce((sum, t) => {
                    if (t.passengerShares && t.passengerShares[person.id] !== undefined) {
                        return sum + parseFloat(t.passengerShares[person.id]);
                    }
                    return sum;
                }, 0);
                
                // Fetch payments
                const payments = await CarpoolApp.getPayments({ personId: person.id, month: currentMonth, year: currentYear });
                const paidAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
                const pendingAmount = Math.max(0, parseFloat((totalAmount - paidAmount).toFixed(2)));

                let statusBadge = '';
                let statusClass = '';
                if (pendingAmount === 0 && totalAmount > 0) {
                    statusBadge = 'Paid';
                    statusClass = 'bg-success badge-paid';
                } else if (paidAmount > 0 && pendingAmount > 0) {
                    statusBadge = 'Partially Paid';
                    statusClass = 'bg-warning text-dark badge-pending';
                } else if (totalAmount === 0) {
                    statusBadge = 'No Dues';
                    statusClass = 'bg-secondary';
                } else {
                    statusBadge = 'Pending';
                    statusClass = 'bg-danger badge-pending';
                }

                // Payment history rows
                let historyHtml = '';
                if (payments.length > 0) {
                    historyHtml = payments.map(p => `
                        <tr>
                            <td>${CarpoolApp.formatDate(p.date)}</td>
                            <td>${CarpoolApp.formatCurrency(p.amount)}</td>
                            <td><span class="badge bg-light text-dark border">${CarpoolApp.escapeHtml(p.method)}</span></td>
                            <td class="text-truncate" style="max-width: 100px;">${CarpoolApp.escapeHtml(p.notes || '-')}</td>
                            <td class="text-end">
                                <button class="btn btn-sm text-danger p-0 delete-payment-btn" data-id="${p.id}"><i class="bi bi-trash"></i></button>
                            </td>
                        </tr>
                    `).join('');
                } else {
                    historyHtml = '<tr><td colspan="5" class="text-center text-muted small py-2">No payments recorded yet</td></tr>';
                }

                // WhatsApp message template: strict Friends Carpool (no profit/policy mention)
                const driverName = driver ? driver.name : 'Vivek';
                const msg = `Hi ${person.name} 👋\n\nCarpool Expense for ${CarpoolApp.MONTHS[currentMonth]} ${currentYear}:\n\n• Travel Days: ${travelDays}\n• Your Distance: ${totalPassengerDistance.toFixed(1)} km\n• Your Contribution: ${CarpoolApp.formatCurrency(totalAmount)}\n• Already Paid: ${CarpoolApp.formatCurrency(paidAmount)}\n• Pending Due: ${CarpoolApp.formatCurrency(pendingAmount)}\n\n(Driver Profit: ₹0 • Fair Distance Sharing)\n\nPlease transfer ${CarpoolApp.formatCurrency(pendingAmount)} to ${driverName}.\n\nThank you! 🚗`;
                const encodedMsg = encodeURIComponent(msg);

                html += `
                    <div class="col-12 col-lg-6">
                        <div class="card shadow-sm border-0 rounded-4 settlement-card h-100">
                            <div class="card-body p-4">
                                <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                                    <h5 class="card-title mb-0 fw-bold">${CarpoolApp.escapeHtml(person.name)}</h5>
                                    <span class="badge rounded-pill ${statusClass}">${statusBadge}</span>
                                </div>
                                
                                <div class="row g-2 text-sm mb-3">
                                    <div class="col-6">
                                        <div class="p-2 bg-light rounded-3">
                                            <span class="text-muted d-block small">Travel Days</span>
                                            <strong class="fs-6">${travelDays}</strong>
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <div class="p-2 bg-light rounded-3">
                                            <span class="text-muted d-block small">Passenger Distance</span>
                                            <strong class="fs-6">${totalPassengerDistance.toFixed(1)} km</strong>
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <div class="p-2 bg-light rounded-3">
                                            <span class="text-muted d-block small">Your Contribution</span>
                                            <strong class="fs-6 text-primary">${CarpoolApp.formatCurrency(totalAmount)}</strong>
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <div class="p-2 bg-light rounded-3">
                                            <span class="text-muted d-block small">Pending Due</span>
                                            <strong class="fs-6 text-danger">${CarpoolApp.formatCurrency(pendingAmount)}</strong>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="d-flex gap-2 flex-wrap mb-3 border-bottom pb-3">
                                    <button class="btn btn-sm btn-primary rounded-pill flex-grow-1 record-payment-btn" 
                                        data-person-id="${person.id}" 
                                        data-person-name="${CarpoolApp.escapeHtml(person.name)}" 
                                        data-pending="${pendingAmount}">
                                        <i class="bi bi-wallet2 me-1"></i> Record Payment
                                    </button>
                                    <button class="btn btn-sm btn-success rounded-pill px-3 send-whatsapp-btn" 
                                        data-phone="${person.phone || ''}" 
                                        data-msg="${encodedMsg}">
                                        <i class="bi bi-whatsapp me-1"></i> Remind
                                    </button>
                                    <button class="btn btn-sm btn-outline-secondary rounded-pill px-3 copy-msg-btn" 
                                        data-msg="${encodedMsg}">
                                        <i class="bi bi-copy"></i>
                                    </button>
                                </div>

                                <div class="payment-history mt-2">
                                    <a class="text-decoration-none text-secondary small fw-bold d-block mb-2" data-bs-toggle="collapse" href="#history-${person.id}" role="button" aria-expanded="false">
                                        <i class="bi bi-clock-history me-1"></i> Payment History (${payments.length})
                                    </a>
                                    <div class="collapse" id="history-${person.id}">
                                        <div class="table-responsive">
                                            <table class="table table-sm align-middle small mb-0">
                                                <thead class="table-light">
                                                    <tr>
                                                        <th>Date</th>
                                                        <th>Amt</th>
                                                        <th>Method</th>
                                                        <th>Notes</th>
                                                        <th></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${historyHtml}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                `;
            }

            container.innerHTML = summaryCardHtml + `<div class="row g-4">${html}</div>`;

            // Attach event listeners
            container.querySelectorAll('.record-payment-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const pid = e.currentTarget.dataset.personId;
                    const name = e.currentTarget.dataset.personName;
                    const pending = parseFloat(e.currentTarget.dataset.pending);
                    
                    document.getElementById('paymentPersonId').value = pid;
                    document.getElementById('paymentPersonName').value = name;
                    document.getElementById('paymentAmount').value = pending > 0 ? pending : '';
                    document.getElementById('paymentDate').value = CarpoolApp.formatDateISO(new Date());
                    document.getElementById('paymentNotes').value = '';
                    document.getElementById('paymentMethod').value = 'UPI';
                    
                    paymentModal.show();
                });
            });

            container.querySelectorAll('.send-whatsapp-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const phone = e.currentTarget.dataset.phone;
                    const msg = decodeURIComponent(e.currentTarget.dataset.msg);
                    CarpoolApp.openWhatsApp(phone, msg);
                });
            });

            container.querySelectorAll('.copy-msg-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const msg = decodeURIComponent(e.currentTarget.dataset.msg);
                    CarpoolApp.copyToClipboard(msg);
                });
            });

            container.querySelectorAll('.delete-payment-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    paymentToDelete = e.currentTarget.dataset.id;
                    deletePaymentModal.show();
                });
            });

        } catch (error) {
            console.error('Error loading settlements:', error);
            container.innerHTML = `<div class="alert alert-danger">Error loading settlement data: ${error.message}</div>`;
        }
    }

    async function savePaymentRecord() {
        const form = document.getElementById('paymentForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const btn = document.getElementById('savePaymentBtn');
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        btn.disabled = true;

        try {
            const personId = document.getElementById('paymentPersonId').value;
            const amount = parseFloat(document.getElementById('paymentAmount').value);
            const date = document.getElementById('paymentDate').value;
            const method = document.getElementById('paymentMethod').value;
            const notes = document.getElementById('paymentNotes').value.trim();

            if (isNaN(amount) || amount <= 0) {
                throw new Error("Please enter a valid payment amount.");
            }

            await CarpoolApp.savePayment({
                personId,
                month: currentMonth,
                year: currentYear,
                amount,
                date,
                method,
                notes
            });

            paymentModal.hide();
            await loadSettlements();

        } catch (error) {
            console.error('Error saving payment:', error);
            CarpoolApp.showToast(error.message || 'Error recording payment.', 'danger');
        } finally {
            btn.innerHTML = 'Save Payment';
            btn.disabled = false;
        }
    }

    async function confirmDeletePayment() {
        if (!paymentToDelete) return;

        const btn = document.getElementById('confirmDeletePaymentBtn');
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Deleting...';
        btn.disabled = true;

        try {
            await CarpoolApp.deletePayment(paymentToDelete);
            deletePaymentModal.hide();
            paymentToDelete = null;
            await loadSettlements();
        } catch (error) {
            console.error('Error deleting payment:', error);
            CarpoolApp.showToast('Error deleting payment.', 'danger');
        } finally {
            btn.innerHTML = 'Delete';
            btn.disabled = false;
        }
    }

    async function exportSettlementData() {
        try {
            const passengers = CarpoolApp.getPassengers();
            const trips = await CarpoolApp.getTrips({ month: currentMonth, year: currentYear });
            
            const rows = [];
            for (const person of passengers) {
                const pTrips = trips.filter(t => t.passengers && (t.passengers.includes(person.id) || t.passengers.includes(person.name)));
                const travelDays = new Set(pTrips.map(t => t.date)).size;
                
                const totalPassengerDistance = pTrips.reduce((sum, t) => {
                    if (t.passengerDetails && t.passengerDetails[person.id] && t.passengerDetails[person.id].chargeableDistance !== undefined) {
                        return sum + parseFloat(t.passengerDetails[person.id].chargeableDistance);
                    }
                    const defaultDist = person.pickupDistance !== undefined ? person.pickupDistance : (person.distance || 10);
                    const multiplier = t.type === 'Full Day' ? 2 : 1;
                    return sum + (defaultDist * multiplier);
                }, 0);

                const totalAmount = pTrips.reduce((sum, t) => {
                    if (t.passengerShares && t.passengerShares[person.id] !== undefined) {
                        return sum + parseFloat(t.passengerShares[person.id]);
                    }
                    return sum;
                }, 0);

                const payments = await CarpoolApp.getPayments({ personId: person.id, month: currentMonth, year: currentYear });
                const paidAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
                const pendingAmount = Math.max(0, totalAmount - paidAmount);

                rows.push([
                    CarpoolApp.MONTHS[currentMonth] + ' ' + currentYear,
                    person.name,
                    travelDays,
                    totalPassengerDistance.toFixed(1),
                    totalAmount.toFixed(2),
                    paidAmount.toFixed(2),
                    pendingAmount.toFixed(2)
                ]);
            }

            const headers = ['Month', 'Passenger', 'Travel Days', 'Passenger Distance (km)', 'Total Amount (₹)', 'Paid (₹)', 'Pending (₹)'];
            CarpoolApp.exportCSV(headers, rows, `settlement-${currentYear}-${currentMonth + 1}.csv`);

        } catch (error) {
            console.error('Error exporting settlement:', error);
            CarpoolApp.showToast('Failed to export settlement data.', 'danger');
        }
    }
});
