let confirmModalInstance;
let pendingClearAction = null;
let allPeople = [];
let initialPetrolPrice = 0;

CarpoolApp.init('settings', async function() {
    confirmModalInstance = new bootstrap.Modal(document.getElementById('confirmModal'));
    
    allPeople = await CarpoolApp.getPeople();
    
    await loadSettings();
    
    document.querySelectorAll('input[name="sharingMode"]').forEach(el => {
        el.addEventListener('change', toggleCustomPercentageSection);
    });
    
    document.getElementById('settingsForm').addEventListener('submit', handleSaveSettings);
    
    document.getElementById('btnClearTrips').addEventListener('click', () => {
        showConfirmModal('Clear All Trips', 'Are you sure you want to delete ALL trips? This cannot be undone.', 'trips');
    });
    document.getElementById('btnClearPayments').addEventListener('click', () => {
        showConfirmModal('Clear All Payments', 'Are you sure you want to delete ALL payments? This cannot be undone.', 'payments');
    });
    document.getElementById('confirmModalActionBtn').addEventListener('click', executeClearAction);
    
    // Add event listeners to percentage inputs
    document.getElementById('customPercentageInputs').addEventListener('input', calculateTotalPercentage);
});

async function loadSettings() {
    const settings = CarpoolApp.state.settings; // Since app.js state already has settings loaded
    
    if(settings) {
        document.getElementById('carName').value = settings.carName || 'Tata Tiago';
        document.getElementById('fuelType').value = settings.fuelType || 'Petrol';
        document.getElementById('mileage').value = settings.mileage || '12';
        
        initialPetrolPrice = parseFloat(settings.petrolPrice || 105);
        document.getElementById('petrolPrice').value = initialPetrolPrice;
        
        if (settings.petrolPriceUpdated) {
            document.getElementById('petrolPriceUpdated').textContent = CarpoolApp.formatDate(settings.petrolPriceUpdated);
        }
        
        document.getElementById('driverName').value = settings.driverName || '';
        document.getElementById('tripExpiryHours').value = settings.tripExpiryHours || 4;
        
        let mode = settings.sharingMode || 'equal';
        const modeInput = document.querySelector(`input[name="sharingMode"][value="${mode}"]`);
        if(modeInput) modeInput.checked = true;
        
        renderCustomPercentageInputs(settings.customPercentages || {});
        toggleCustomPercentageSection();
    }
}

function renderCustomPercentageInputs(customPercentages) {
    const container = document.getElementById('customPercentageInputs');
    container.innerHTML = '';
    
    allPeople.forEach(person => {
        if (!person.active) return; // Only show active people
        
        const col = document.createElement('div');
        col.className = 'col-6 col-md-4';
        
        const val = customPercentages[person.id] || 0;
        
        col.innerHTML = `
            <label class="form-label mb-1">${CarpoolApp.escapeHtml(person.name)} ${person.role === 'driver' ? '(Driver)' : ''}</label>
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
    const mode = document.querySelector('input[name="sharingMode"]:checked').value;
    const container = document.getElementById('customPercentageContainer');
    
    if (mode === 'custom_percentage') {
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
    const mode = document.querySelector('input[name="sharingMode"]:checked').value;
    
    let customPercentages = {};
    if (mode === 'custom_percentage') {
        const total = calculateTotalPercentage();
        if (Math.abs(total - 100) > 0.1) {
            CarpoolApp.showToast('Percentages must sum to exactly 100%', 'danger');
            return;
        }
        
        document.querySelectorAll('.pct-input').forEach(input => {
            customPercentages[input.dataset.pid] = parseFloat(input.value || 0);
        });
    }
    
    // Find driver ID by name, or use existing driver ID
    let driverId = CarpoolApp.state.settings.driverId;
    const driverName = document.getElementById('driverName').value;
    const driverObj = allPeople.find(p => p.name.toLowerCase() === driverName.toLowerCase());
    if (driverObj) {
        driverId = driverObj.id;
    }
    
    const settingsToSave = {
        carName: document.getElementById('carName').value,
        fuelType: document.getElementById('fuelType').value,
        mileage: parseFloat(document.getElementById('mileage').value),
        petrolPrice: newPrice,
        driverName: driverName,
        driverId: driverId,
        tripExpiryHours: parseInt(document.getElementById('tripExpiryHours').value),
        sharingMode: mode,
        customPercentages: customPercentages
    };
    
    // Update petrol price updated date if price changed
    if (newPrice !== initialPetrolPrice || !CarpoolApp.state.settings.petrolPriceUpdated) {
        settingsToSave.petrolPriceUpdated = new Date().toISOString();
    } else {
        settingsToSave.petrolPriceUpdated = CarpoolApp.state.settings.petrolPriceUpdated;
    }

    try {
        const btn = document.getElementById('btnSaveSettings');
        const origText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
        btn.disabled = true;
        
        await CarpoolApp.saveSettings(settingsToSave);
        
        initialPetrolPrice = newPrice;
        if (settingsToSave.petrolPriceUpdated) {
            document.getElementById('petrolPriceUpdated').textContent = CarpoolApp.formatDate(settingsToSave.petrolPriceUpdated);
        }
        
        CarpoolApp.showToast('Settings saved successfully!', 'success');
        
        setTimeout(() => {
            btn.innerHTML = origText;
            btn.disabled = false;
        }, 500);
    } catch(err) {
        console.error("Error saving settings:", err);
        CarpoolApp.showToast('Error saving settings', 'danger');
        
        const btn = document.getElementById('btnSaveSettings');
        btn.innerHTML = '<i class="bi bi-save me-2"></i>Save Settings';
        btn.disabled = false;
    }
}

function showConfirmModal(title, message, collection) {
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalBody').textContent = message;
    pendingClearAction = collection;
    confirmModalInstance.show();
}

async function executeClearAction() {
    if (!pendingClearAction) return;
    
    const btn = document.getElementById('confirmModalActionBtn');
    const origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Clearing...';
    btn.disabled = true;
    
    try {
        await clearCollection(pendingClearAction);
        CarpoolApp.showToast(`Successfully cleared all ${pendingClearAction}!`, 'success');
    } catch(err) {
        console.error(`Error clearing ${pendingClearAction}:`, err);
        CarpoolApp.showToast(`Error clearing ${pendingClearAction}: ` + err.message, 'danger');
    }
    
    btn.innerHTML = origText;
    btn.disabled = false;
    confirmModalInstance.hide();
    pendingClearAction = null;
}

async function clearCollection(collectionName) {
    const snapshot = await CarpoolApp.db.collection(collectionName).get();
    if (snapshot.size === 0) return;
    
    // Firestore allows max 500 operations per batch
    const batches = [];
    let batch = CarpoolApp.db.batch();
    let operationCounter = 0;

    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        operationCounter++;

        if (operationCounter === 500) {
            batches.push(batch.commit());
            batch = CarpoolApp.db.batch();
            operationCounter = 0;
        }
    });

    if (operationCounter > 0) {
        batches.push(batch.commit());
    }

    await Promise.all(batches);
}
