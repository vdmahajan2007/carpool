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
            const passengers = await CarpoolApp.getPassengers();
            const driver = await CarpoolApp.getDriver();
            const trips = await CarpoolApp.getTrips({ month: currentMonth, year: currentYear });
            
            if (passengers.length === 0) {
                container.innerHTML = '<div class="alert alert-info">No passengers found. Please add people first.</div>';
                return;
            }

            let html = '';
            
            for (const person of passengers) {
                // Filter trips where this passenger was present
                const pTrips = trips.filter(t => t.passengers && t.passengers.includes(person.id));
                
                const travelDays = new Set(pTrips.map(t => t.date)).size;
                const totalDistance = pTrips.reduce((sum, t) => sum + (t.actualDistance || 0), 0);
                
                // Calculate fuel share logic
                const totalAmount = pTrips.reduce((sum, t) => sum + (t.passengerShares && t.passengerShares[person.id] ? t.passengerShares[person.id] : 0), 0);
                
                // Fetch payments
                const payments = await CarpoolApp.getPayments({ personId: person.id, month: currentMonth, year: currentYear });
                const paidAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
                const pendingAmount = Math.max(0, totalAmount - paidAmount);

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

                // Whatsapp message template
                const driverName = driver ? driver.name : 'the driver';
                const msg = `Hi ${person.name} 👋\n\n${CarpoolApp.MONTHS[currentMonth]} ${currentYear} carpool expense is ${CarpoolApp.formatCurrency(totalAmount)}.\n\nTravel days: ${travelDays}\nTotal distance: ${totalDistance.toFixed(1)} km\nFuel cost share: ${CarpoolApp.formatCurrency(totalAmount)}\nPaid: ${CarpoolApp.formatCurrency(paidAmount)}\n\nPlease transfer ${CarpoolApp.formatCurrency(pendingAmount)} to ${driverName}.\n\nThank you! 🚗`;
                const encodedMsg = encodeURIComponent(msg);

                html += `
                    <div class="card shadow-sm settlement-card">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                                <h5 class="card-title mb-0 fw-bold">${CarpoolApp.escapeHtml(person.name)}</h5>
                                <span class="badge rounded-pill ${statusClass}">${statusBadge}</span>
                            </div>
                            
                            <div class="row text-sm mb-3">
                                <div class="col-6 mb-2">
                                    <span class="text-muted d-block">Travel Days</span>
                                    <strong>${travelDays}</strong>
                                </div>
                                <div class="col-6 mb-2">
                                    <span class="text-muted d-block">Total Distance</span>
                                    <strong>${totalDistance.toFixed(1)} km</strong>
                                </div>
                                <div class="col-6 mb-2">
                                    <span class="text-muted d-block">Total Amount</span>
                                    <strong>${CarpoolApp.formatCurrency(totalAmount)}</strong>
                                </div>
                                <div class="col-6 mb-2">
                                    <span class="text-muted d-block">Pending Amount</span>
                                    <strong class="text-danger">${CarpoolApp.formatCurrency(pendingAmount)}</strong>
                                </div>
                            </div>
                            
                            <div class="d-flex gap-2 flex-wrap mb-3 border-bottom pb-3">
                                <button class="btn btn-sm btn-primary flex-grow-1 record-payment-btn" 
                                    data-person-id="${person.id}" 
                                    data-person-name="${CarpoolApp.escapeHtml(person.name)}" 
                                    data-pending="${pendingAmount}">
                                    <i class="bi bi-wallet2"></i> Record Payment
                                </button>
                                <button class="btn btn-sm btn-success px-3 send-whatsapp-btn" 
                                    data-phone="${person.phone || ''}" 
                                    data-msg="${encodedMsg}">
                                    <i class="bi bi-whatsapp"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-secondary px-3 copy-msg-btn" 
                                    data-msg="${encodedMsg}">
                                    <i class="bi bi-copy"></i>
                                </button>
                            </div>

                            <div class="payment-history mt-2">
                                <a class="text-decoration-none text-secondary small fw-bold d-block mb-2" data-bs-toggle="collapse" href="#history-${person.id}" role="button" aria-expanded="false">
                                    <i class="bi bi-clock-history"></i> Payment History
                                </a>
                                <div class="collapse" id="history-${person.id}">
                                    <div class="table-responsive">
                                        <table class="table table-sm align-middle">
                                            <thead>
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
                `;
            }

            container.innerHTML = html;

            // Attach event listeners for dynamic buttons
            container.querySelectorAll('.record-payment-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const btnEl = e.currentTarget;
                    document.getElementById('payPersonId').value = btnEl.dataset.personId;
                    document.getElementById('payPersonName').value = btnEl.dataset.personName;
                    document.getElementById('payAmount').value = btnEl.dataset.pending > 0 ? btnEl.dataset.pending : '';
                    document.getElementById('payDate').value = CarpoolApp.formatDateISO(new Date());
                    document.getElementById('payMethod').value = 'UPI';
                    document.getElementById('payNotes').value = '';
                    paymentModal.show();
                });
            });

            container.querySelectorAll('.send-whatsapp-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const btnEl = e.currentTarget;
                    const phone = btnEl.dataset.phone;
                    const msg = decodeURIComponent(btnEl.dataset.msg);
                    if (!phone) {
                        CarpoolApp.showToast('No phone number saved for this person.', 'warning');
                        return;
                    }
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
            container.innerHTML = `<div class="alert alert-danger">Error loading settlements: ${error.message}</div>`;
        }
    }

    async function savePaymentRecord() {
        const form = document.getElementById('paymentForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const personId = document.getElementById('payPersonId').value;
        const amount = parseFloat(document.getElementById('payAmount').value);
        const date = document.getElementById('payDate').value;
        const method = document.getElementById('payMethod').value;
        const notes = document.getElementById('payNotes').value;

        try {
            const btn = document.getElementById('savePaymentBtn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';
            btn.disabled = true;

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
            CarpoolApp.showToast('Payment recorded successfully', 'success');
            await loadSettlements();
        } catch (error) {
            console.error('Error saving payment:', error);
            CarpoolApp.showToast('Failed to record payment', 'danger');
        } finally {
            const btn = document.getElementById('savePaymentBtn');
            btn.innerHTML = 'Save Payment';
            btn.disabled = false;
        }
    }

    async function confirmDeletePayment() {
        if (!paymentToDelete) return;
        
        try {
            const btn = document.getElementById('confirmDeletePaymentBtn');
            btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Deleting...';
            btn.disabled = true;

            await CarpoolApp.deletePayment(paymentToDelete);
            
            deletePaymentModal.hide();
            paymentToDelete = null;
            CarpoolApp.showToast('Payment deleted', 'success');
            await loadSettlements();
        } catch (error) {
            console.error('Error deleting payment:', error);
            CarpoolApp.showToast('Failed to delete payment', 'danger');
        } finally {
            const btn = document.getElementById('confirmDeletePaymentBtn');
            btn.innerHTML = 'Delete';
            btn.disabled = false;
        }
    }

    async function exportSettlementData() {
        try {
            const passengers = await CarpoolApp.getPassengers();
            const trips = await CarpoolApp.getTrips({ month: currentMonth, year: currentYear });
            
            const rows = [];
            const headers = ['Name', 'Travel Days', 'Total Distance (km)', 'Total Amount', 'Paid Amount', 'Pending Amount', 'Status'];

            for (const person of passengers) {
                const pTrips = trips.filter(t => t.passengers && t.passengers.includes(person.id));
                const travelDays = new Set(pTrips.map(t => t.date)).size;
                const totalDistance = pTrips.reduce((sum, t) => sum + (t.actualDistance || 0), 0);
                const totalAmount = pTrips.reduce((sum, t) => sum + (t.passengerShares && t.passengerShares[person.id] ? t.passengerShares[person.id] : 0), 0);
                
                const payments = await CarpoolApp.getPayments({ personId: person.id, month: currentMonth, year: currentYear });
                const paidAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
                const pendingAmount = Math.max(0, totalAmount - paidAmount);

                let status = 'Pending';
                if (pendingAmount === 0 && totalAmount > 0) status = 'Paid';
                else if (paidAmount > 0 && pendingAmount > 0) status = 'Partially Paid';
                else if (totalAmount === 0) status = 'No Dues';

                rows.push([
                    person.name,
                    travelDays,
                    totalDistance.toFixed(2),
                    totalAmount.toFixed(2),
                    paidAmount.toFixed(2),
                    pendingAmount.toFixed(2),
                    status
                ]);
            }

            const monthName = CarpoolApp.MONTHS[currentMonth];
            const filename = `Settlement_${monthName}_${currentYear}.csv`;
            CarpoolApp.exportCSV(headers, rows, filename);
        } catch (error) {
            console.error('Error exporting data:', error);
            CarpoolApp.showToast('Failed to export data', 'danger');
        }
    }
});
