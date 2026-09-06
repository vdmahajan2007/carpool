// ============================================================
// js/settings.js — Settings Logic
// ============================================================

let confirmModalInstance;
let pendingClearAction = null;
let allPeople = [];

CarpoolApp.init('settings', async function() {
    confirmModalInstance = new bootstrap.Modal(document.getElementById('confirmModal'));
    
    allPeople = CarpoolApp.getPeople();
    
    await loadSettings();
    
    document.querySelectorAll('input[name="sharingMode"]').forEach(el => {
        el.addEventListener('change', toggleCustomPercentageSection);
    });
    
    document.getElementById('settingsForm').addEventListener('submit', handleSaveSettings);
    
    document.getElementById('petrolPrice').addEventListener('input', updateRatePreview);
    document.getElementById('mileage').addEventListener('input', updateRatePreview);

    document.getElementById('btnBackupData').addEventListener('click', () => {
        CarpoolApp.backupAll();
    });

    document.getElementById('restoreFileInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const data = await CarpoolApp.importJSON(file);
            await CarpoolApp.restoreAll(data);
        } catch (err) {
            CarpoolApp.showToast('Failed to restore data: ' + err.message, 'danger');
        }
    });

    document.getElementById('btnClearTrips').addEventListener('click', () => {
        showConfirmModal('Clear All Trips', 'Are you sure you want to delete ALL trip records? This cannot be undone.', 'trips');
    });
    document.getElementById('btnClearPayments').addEventListener('click', () => {
        showConfirmModal('Clear All Payments', 'Are you sure you want to delete ALL payment records? This cannot be undone.', 'payments');
    });
    document.getElementById('confirmModalActionBtn').addEventListener('click', executeClearAction);
    
    document.getElementById('customPercentageInputs').addEventListener('input', calculateTotalPercentage);
});

async function loadSettings() {
    const settings = CarpoolApp.getSettings();
    allPeople = CarpoolApp.getPeople();
    
    if (settings) {
        document.getElementById('carName').value = settings.carName || 'Tata Tiago';
        document.getElementById('fuelType').value = settings.fuelType || 'Petrol';
        document.getElementById('mileage').value = settings.mileage || '12';
        document.getElementById('petrolPrice').value = settings.petrolPrice || 105;
        document.getElementById('driverDistance').value = settings.driverDistance || 17;
        
        if (settings.petrolPriceUpdated) {
            document.getElementById('petrolPriceUpdated').textContent = CarpoolApp.formatDate(settings.petrolPriceUpdated);
        }
        
        document.getElementById('driverName').value = settings.driverName || 'Vivek';
        document.getElementById('tripExpiryHours').value = settings.tripExpiryHours || 4;
        
        let mode = (settings.sharingMode || 'distance').toLowerCase();
        if (mode === 'distance-based' || mode === 'distance_based') mode = 'distance';
        
        const modeInput = document.querySelector(`input[name="sharingMode"][value="${mode}"]`);
        if (modeInput) modeInput.checked = true;
        
        renderCustomPercentageInputs(settings.customPercentages || {});
        toggleCustomPercentageSection();
        updateRatePreview();
    }
}

function updateRatePreview() {
    const price = parseFloat(document.getElementById('petrolPrice').value) || 105;
    const mileage = parseFloat(document.getElementById('mileage').value) || 12;
    const rate = CarpoolApp.calculateRatePerKm(price, mileage);
    document.getElementById('settingsRatePreview').textContent = `₹${rate.toFixed(2)} / km (₹${price} ÷ ${mileage} km/l)`;
}

function renderCustomPercentageInputs(customPercentages) {
    const container = document.getElementById('customPercentageInputs');
    container.innerHTML = '';
    
    allPeople.forEach(person => {
        if (person.active === false) return;
        
        const col = document.createElement('div');
        col.className = 'col-6 col-md-4';
        
        const val = customPercentages[person.id] || 0;
        
        col.innerHTML = `
            <label class="form-label small mb-1 fw-bold">${CarpoolApp.escapeHtml(person.name)} ${person.role === 'Driver' ? '(Driver)' : ''}</label>
            <div class="input-group input-group-sm">
                <input type="number" class="form-control pct-input" data-pid="${person.id}" value="${val}" min="0" max="100" step="0.1">
                <span class="input-group-text">%</span>
            </div>
        `;
        container.appendChild(col);
    });
    
    calculateTotalPercentage();
}

function toggleCustomPercentageSection() {
    const checkedMode = document.querySelector('input[name="sharingMode"]:checked');
    const mode = checkedMode ? checkedMode.value : 'distance';
    const container = document.getElementById('customPercentageContainer');
    
    if (mode === 'custom_percentage' || mode === 'custom-percentage') {
        container.classList.remove('d-none');
    } else {
        container.classList.add('d-none');
    }
}

function calculateTotalPercentage() {
    let total = 0;
    document.querySelectorAll('.pct-input').forEach(input => {
        total += parseFloat(input.value || 0);
    });
    
    const totalEl = document.getElementById('percentageTotal');
    totalEl.textContent = total.toFixed(1);
    
    if (Math.abs(total - 100) > 0.1) {
        totalEl.classList.add('text-danger');
        document.getElementById('percentageError').classList.remove('d-none');
    } else {
        totalEl.classList.remove('text-danger');
        document.getElementById('percentageError').classList.add('d-none');
    }
    
    return total;
}

async function handleSaveSettings(e) {
    e.preventDefault();
    
    const newPrice = parseFloat(document.getElementById('petrolPrice').value);
    const checkedMode = document.querySelector('input[name="sharingMode"]:checked');
    const mode = checkedMode ? checkedMode.value : 'distance';
    
    let customPercentages = {};
    if (mode === 'custom_percentage' || mode === 'custom-percentage') {
        const total = calculateTotalPercentage();
        if (Math.abs(total - 100) > 0.1) {
            CarpoolApp.showToast('Percentages must sum to exactly 100%', 'danger');
            return;
        }
        
        document.querySelectorAll('.pct-input').forEach(input => {
            customPercentages[input.dataset.pid] = parseFloat(input.value || 0);
        });
    }
    
    let driverId = CarpoolApp.getSettings()?.driverId || 'vivek';
    const driverName = document.getElementById('driverName').value.trim();
    const driverObj = allPeople.find(p => p.name.toLowerCase() === driverName.toLowerCase());
    if (driverObj) {
        driverId = driverObj.id;
    }
    
    const settingsToSave = {
        carName: document.getElementById('carName').value.trim(),
        fuelType: document.getElementById('fuelType').value,
        mileage: parseFloat(document.getElementById('mileage').value),
        petrolPrice: newPrice,
        petrolPriceUpdated: CarpoolApp.formatDateISO(new Date()),
        driverName: driverName,
        driverId: driverId,
        driverDistance: parseFloat(document.getElementById('driverDistance').value) || 17,
        tripExpiryHours: parseInt(document.getElementById('tripExpiryHours').value) || 4,
        sharingMode: mode,
        customPercentages: customPercentages
    };
    
    const btn = document.getElementById('btnSaveSettings');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving Settings...';
    
    const success = await CarpoolApp.saveSettings(settingsToSave);
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-save me-2"></i>Save All Settings';
    
    if (success) {
        document.getElementById('petrolPriceUpdated').textContent = CarpoolApp.formatDate(settingsToSave.petrolPriceUpdated);
    }
}

function showConfirmModal(title, bodyText, action) {
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalBody').textContent = bodyText;
    pendingClearAction = action;
    confirmModalInstance.show();
}

async function executeClearAction() {
    if (!pendingClearAction) return;
    
    const actionBtn = document.getElementById('confirmModalActionBtn');
    actionBtn.disabled = true;
    actionBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Clearing...';
    
    try {
        if (pendingClearAction === 'trips') {
            const snapshot = await CarpoolApp.db.collection('trips').get();
            const batch = CarpoolApp.db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            CarpoolApp.showToast('All trip records have been cleared.', 'success');
        } else if (pendingClearAction === 'payments') {
            const snapshot = await CarpoolApp.db.collection('payments').get();
            const batch = CarpoolApp.db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            CarpoolApp.showToast('All payment records have been cleared.', 'success');
        }
        confirmModalInstance.hide();
    } catch (error) {
        console.error('Clear action error:', error);
        CarpoolApp.showToast('Failed to clear records: ' + error.message, 'danger');
    } finally {
        actionBtn.disabled = false;
        actionBtn.innerHTML = 'Proceed';
        pendingClearAction = null;
    }
}
