CarpoolApp.init('people', async function() {
    let personModal;
    let deletePersonModal;
    let personToDelete = null;

    const AVATAR_COLORS = ['#4361ee', '#7209b7', '#ef476f', '#06d6a0', '#ff9f1c'];

    personModal = new bootstrap.Modal(document.getElementById('personModal'));
    deletePersonModal = new bootstrap.Modal(document.getElementById('deletePersonModal'));

    document.getElementById('addPersonBtn').addEventListener('click', openAddModal);
    document.getElementById('savePersonBtn').addEventListener('click', savePersonData);
    document.getElementById('confirmDeletePersonBtn').addEventListener('click', confirmDeletePerson);

    await loadPeople();

    async function loadPeople() {
        const container = document.getElementById('peopleContainer');
        container.innerHTML = '<div class="col-12 text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>';

        try {
            const people = await CarpoolApp.getPeople();
            
            if (people.length === 0) {
                container.innerHTML = '<div class="col-12"><div class="alert alert-info">No people found. Add yourself or others to get started.</div></div>';
                return;
            }

            let html = '';
            
            people.forEach((person, index) => {
                const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
                const initial = (person.name || '?').charAt(0).toUpperCase();
                const roleBadge = person.role === 'Driver' ? '<span class="badge bg-primary">Driver</span>' : '<span class="badge bg-secondary">Passenger</span>';
                const inactiveClass = person.active === false ? 'inactive' : '';

                html += `
                    <div class="col-12 col-md-6 col-lg-4">
                        <div class="card shadow-sm person-card ${inactiveClass}">
                            <div class="card-body d-flex align-items-start">
                                <div class="person-avatar me-3 flex-shrink-0" style="background-color: ${color};">
                                    ${initial}
                                </div>
                                <div class="flex-grow-1">
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <h5 class="card-title mb-0 fw-bold">${CarpoolApp.escapeHtml(person.name)}</h5>
                                        ${roleBadge}
                                    </div>
                                    <div class="text-muted small mb-2">
                                        <div class="mb-1"><i class="bi bi-telephone text-secondary"></i> ${CarpoolApp.escapeHtml(person.phone || 'No phone')}</div>
                                        <div><i class="bi bi-signpost-split text-secondary"></i> Distance: ${person.distance} km one way</div>
                                    </div>
                                    <div class="d-flex gap-2 mt-2 border-top pt-2">
                                        <button class="btn btn-sm btn-outline-primary flex-grow-1 edit-person-btn" data-id="${person.id}">
                                            <i class="bi bi-pencil"></i> Edit
                                        </button>
                                        <button class="btn btn-sm btn-outline-danger px-3 delete-person-btn" data-id="${person.id}" data-name="${CarpoolApp.escapeHtml(person.name)}">
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    </div>
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
                    personToDelete = e.currentTarget.dataset.id;
                    const name = e.currentTarget.dataset.name;
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
        document.getElementById('personDistance').value = person.distance || '';
        document.getElementById('personActive').checked = person.active !== false;
        
        document.getElementById('personModalTitle').textContent = 'Edit Person';
        personModal.show();
    }

    async function savePersonData() {
        const form = document.getElementById('personForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const btn = document.getElementById('savePersonBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        btn.disabled = true;

        try {
            let id = document.getElementById('personId').value;
            const name = document.getElementById('personName').value.trim();
            const phone = document.getElementById('personPhone').value.trim();
            const role = document.getElementById('personRole').value;
            const distance = parseFloat(document.getElementById('personDistance').value);
            const active = document.getElementById('personActive').checked;

            if (!id) {
                // Auto-generate ID from name if it's a new person
                id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                // Avoid empty IDs
                if (!id) id = CarpoolApp.generateId();
            }

            // Optional: validate phone number format if provided
            if (phone && !/^[+\d\s-]+$/.test(phone)) {
                throw new Error("Invalid phone number format");
            }

            await CarpoolApp.savePerson({
                id,
                name,
                phone,
                role,
                distance,
                active
            });

            personModal.hide();
            CarpoolApp.showToast('Person saved successfully', 'success');
            await loadPeople();
        } catch (error) {
            console.error('Error saving person:', error);
            CarpoolApp.showToast(error.message || 'Failed to save person', 'danger');
        } finally {
            btn.innerHTML = 'Save';
            btn.disabled = false;
        }
    }

    async function confirmDeletePerson() {
        if (!personToDelete) return;
        
        const btn = document.getElementById('confirmDeletePersonBtn');
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Deleting...';
        btn.disabled = true;

        try {
            // Check if it's the last driver
            const people = await CarpoolApp.getPeople();
            const person = people.find(p => p.id === personToDelete);
            
            if (person && person.role === 'Driver') {
                const driverCount = people.filter(p => p.role === 'Driver').length;
                if (driverCount <= 1) {
                    throw new Error("Cannot delete the only driver in the carpool.");
                }
            }

            await CarpoolApp.deletePerson(personToDelete);
            
            deletePersonModal.hide();
            personToDelete = null;
            CarpoolApp.showToast('Person deleted', 'success');
            await loadPeople();
        } catch (error) {
            console.error('Error deleting person:', error);
            CarpoolApp.showToast(error.message || 'Failed to delete person', 'danger');
        } finally {
            btn.innerHTML = 'Delete';
            btn.disabled = false;
            deletePersonModal.hide();
        }
    }
});
