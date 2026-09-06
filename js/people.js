// ============================================================
// js/people.js — People Management Logic
// ============================================================

CarpoolApp.init('people', async function() {
    let personModal;
    let deletePersonModal;
    let personToDelete = null;

    const AVATAR_COLORS = ['#4361ee', '#7209b7', '#ef476f', '#06d6a0', '#ff9f1c', '#118ab2'];

    personModal = new bootstrap.Modal(document.getElementById('personModal'));
    deletePersonModal = new bootstrap.Modal(document.getElementById('deletePersonModal'));

    document.getElementById('addPersonBtn').addEventListener('click', openAddModal);
    document.getElementById('savePersonBtn').addEventListener('click', savePersonData);
    document.getElementById('confirmDeletePersonBtn').addEventListener('click', confirmDeletePerson);

    // Auto sync pickup distance if user enters home to office distance when adding
    document.getElementById('personDistance').addEventListener('input', (e) => {
        const pDist = document.getElementById('personPickupDistance');
        if (!pDist.value || document.getElementById('personId').value === '') {
            pDist.value = e.target.value;
        }
    });

    await loadPeople();

    async function loadPeople() {
        const container = document.getElementById('peopleContainer');
        container.innerHTML = '<div class="col-12 text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>';

        try {
            const people = await CarpoolApp.getPeople();
            
            if (people.length === 0) {
                container.innerHTML = '<div class="col-12"><div class="alert alert-info">No members found. Add Vivek or your carpool passengers to get started.</div></div>';
                return;
            }

            let html = '';
            
            people.forEach((person, index) => {
                const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
                const initial = (person.name || '?').charAt(0).toUpperCase();
                const roleBadge = person.role === 'Driver' 
                    ? '<span class="badge bg-primary rounded-pill px-3 py-1"><i class="bi bi-steering-wheel me-1"></i> Driver</span>' 
                    : '<span class="badge bg-secondary rounded-pill px-3 py-1"><i class="bi bi-person me-1"></i> Passenger</span>';
                const inactiveClass = person.active === false ? 'opacity-50' : '';

                const pDist = person.pickupDistance !== undefined ? person.pickupDistance : person.distance;

                html += `
                    <div class="col-12 col-md-6 col-lg-4">
                        <div class="card shadow-sm border-0 rounded-4 person-card ${inactiveClass} h-100">
                            <div class="card-body d-flex flex-column justify-content-between p-3">
                                <div>
                                    <div class="d-flex align-items-center mb-3">
                                        <div class="person-avatar me-3 flex-shrink-0" style="background-color: ${color}; width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.25rem;">
                                            ${initial}
                                        </div>
                                        <div class="flex-grow-1">
                                            <div class="d-flex justify-content-between align-items-center">
                                                <h5 class="card-title mb-0 fw-bold">${CarpoolApp.escapeHtml(person.name)}</h5>
                                            </div>
                                            <div class="mt-1">${roleBadge}</div>
                                        </div>
                                    </div>
                                    
                                    <div class="bg-light rounded-3 p-2 mb-2 small">
                                        <div class="d-flex justify-content-between mb-1">
                                            <span class="text-muted"><i class="bi bi-signpost-2 me-1"></i> Home → Office:</span>
                                            <strong>${person.distance} km</strong>
                                        </div>
                                        <div class="d-flex justify-content-between mb-1">
                                            <span class="text-muted"><i class="bi bi-geo-alt me-1"></i> Pickup Distance:</span>
                                            <strong class="text-primary">${pDist} km</strong>
                                        </div>
                                        ${person.pickupLocation ? `
                                        <div class="text-truncate text-muted">
                                            <i class="bi bi-pin-map me-1"></i> ${CarpoolApp.escapeHtml(person.pickupLocation)}
                                        </div>` : ''}
                                    </div>

                                    <div class="small text-muted mb-2">
                                        <i class="bi bi-telephone text-success me-1"></i> ${person.phone ? CarpoolApp.escapeHtml(person.phone) : '<span class="text-muted fst-italic">No phone added</span>'}
                                    </div>
                                </div>

                                <div class="d-flex gap-2 pt-2 border-top">
                                    <button class="btn btn-sm btn-outline-primary flex-grow-1 rounded-pill edit-person-btn" data-id="${person.id}">
                                        <i class="bi bi-pencil me-1"></i> Edit
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger rounded-pill px-3 delete-person-btn" data-id="${person.id}" data-name="${CarpoolApp.escapeHtml(person.name)}" data-role="${person.role}">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;

            // Attach event listeners
            container.querySelectorAll('.edit-person-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.dataset.id;
                    const person = people.find(p => p.id === id);
                    if (person) openEditModal(person);
                });
            });

            container.querySelectorAll('.delete-person-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.dataset.id;
                    const name = e.currentTarget.dataset.name;
                    const role = e.currentTarget.dataset.role;
                    
                    const drivers = people.filter(p => p.role === 'Driver');
                    if (role === 'Driver' && drivers.length <= 1) {
                        CarpoolApp.showToast('Cannot delete the primary driver.', 'warning');
                        return;
                    }

                    personToDelete = id;
                    document.getElementById('deletePersonName').textContent = name;
                    deletePersonModal.show();
                });
            });

        } catch (error) {
            console.error('Error loading people:', error);
            container.innerHTML = `<div class="col-12"><div class="alert alert-danger">Error loading people: ${error.message}</div></div>`;
        }
    }

    function openAddModal() {
        document.getElementById('personForm').reset();
        document.getElementById('personId').value = '';
        document.getElementById('personActive').checked = true;
        document.getElementById('personModalTitle').textContent = 'Add Person';
        personModal.show();
    }

    function openEditModal(person) {
        document.getElementById('personId').value = person.id;
        document.getElementById('personName').value = person.name;
        document.getElementById('personPhone').value = person.phone || '';
        document.getElementById('personRole').value = person.role || 'Passenger';
        document.getElementById('personDistance').value = person.distance !== undefined ? person.distance : '';
        document.getElementById('personPickupDistance').value = person.pickupDistance !== undefined ? person.pickupDistance : (person.distance || '');
        document.getElementById('personHomeLocation').value = person.homeLocation || '';
        document.getElementById('personPickupLocation').value = person.pickupLocation || '';
        document.getElementById('personActive').checked = person.active !== false;
        
        document.getElementById('personModalTitle').textContent = `Edit ${person.name}`;
        personModal.show();
    }

    async function savePersonData() {
        const form = document.getElementById('personForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const btn = document.getElementById('savePersonBtn');
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        btn.disabled = true;

        try {
            let id = document.getElementById('personId').value;
            const name = document.getElementById('personName').value.trim();
            const phone = document.getElementById('personPhone').value.trim();
            const role = document.getElementById('personRole').value;
            const distance = parseFloat(document.getElementById('personDistance').value);
            const pickupDistVal = document.getElementById('personPickupDistance').value;
            const pickupDistance = pickupDistVal ? parseFloat(pickupDistVal) : distance;
            const homeLocation = document.getElementById('personHomeLocation').value.trim();
            const pickupLocation = document.getElementById('personPickupLocation').value.trim();
            const active = document.getElementById('personActive').checked;

            if (isNaN(distance) || distance <= 0) {
                throw new Error("Please enter a valid positive distance.");
            }

            if (!id) {
                id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                if (!id) id = CarpoolApp.generateId();
            }

            if (phone && !/^[+\d\s-]+$/.test(phone)) {
                throw new Error("Invalid phone number format. Please enter a valid number (e.g. +919876543210).");
            }

            await CarpoolApp.savePerson({
                id,
                name,
                phone,
                role,
                distance,
                pickupDistance,
                homeLocation,
                pickupLocation,
                active
            });

            personModal.hide();
            await loadPeople();

        } catch (error) {
            console.error('Error saving person:', error);
            CarpoolApp.showToast(error.message || 'Error saving person.', 'danger');
        } finally {
            btn.innerHTML = 'Save Person';
            btn.disabled = false;
        }
    }

    async function confirmDeletePerson() {
        if (!personToDelete) return;

        const btn = document.getElementById('confirmDeletePersonBtn');
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Deleting...';
        btn.disabled = true;

        try {
            await CarpoolApp.deletePerson(personToDelete);
            deletePersonModal.hide();
            personToDelete = null;
            await loadPeople();
        } catch (error) {
            console.error('Error deleting person:', error);
            CarpoolApp.showToast('Error deleting person.', 'danger');
        } finally {
            btn.innerHTML = 'Delete';
            btn.disabled = false;
        }
    }
});
