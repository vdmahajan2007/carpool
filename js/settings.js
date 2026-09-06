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
});

async function loadSettings() {
    const settings = CarpoolApp.getSettings();
    allPeople = CarpoolApp.getPeople();
    
    if (settings) {
        document.getElementById('carName').value = settings.carName || 'Tata Tiago';
        document.getElementById('fuelType').value = settings.fuelType || 'Petrol';
        document.getElementById('mileage').value = settings.mileage || '12';
        document.getElementById('petrolPrice').value = settings.petrolPrice || 105;
        document.getElementById('driverDistance').value = settings.driverDistance || 18;
        
        if (settings.petrolPriceUpdated) {
            document.getElementById('petrolPriceUpdated').textContent = CarpoolApp.formatDate(settings.petrolPriceUpdated);
        }
        
        document.getElementById('driverName').value = settings.driverName || 'Vivek';
        document.getElementById('tripExpiryHours').value = settings.tripExpiryHours || 4;
        
        updateRatePreview();
    }
}

function updateRatePreview() {
    const price = parseFloat(document.getElementById('petrolPrice').value) || 105;
    const mileage = parseFloat(document.getElementById('mileage').value) || 12;
    const rate = CarpoolApp.calculateRatePerKm(price, mileage);
    document.getElementById('settingsRatePreview').textContent = `₹${rate.toFixed(2)} / km (₹${price} ÷ ${mileage} km/l)`;
}

async function handleSaveSettings(e) {
    e.preventDefault();
    
    const newPrice = parseFloat(document.getElementById('petrolPrice').value);
    
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
        driverDistance: parseFloat(document.getElementById('driverDistance').value) || 18,
        tripExpiryHours: parseInt(document.getElementById('tripExpiryHours').value) || 4
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
