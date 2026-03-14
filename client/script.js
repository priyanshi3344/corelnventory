var API_BASE_URL = "http://localhost:5050/api";
var appState = {
	products: [],
	warehouses: [],
	moves: [],
	operations: [],
	dashboard: null,
	reportSettings: null,
	tasks: []
};

function showAuthMessage(message, type){
	var errorEl = document.getElementById("loginError");
	if (!errorEl) { return; }
	errorEl.style.color = type === "success" ? "#2a7a56" : "#c0392b";
	errorEl.textContent = message || "";
}

function togglePassword(inputId, toggleBtn){
	var input = document.getElementById(inputId);
	if (!input) { return; }

	var show = input.type === "password";
	input.type = show ? "text" : "password";
	if (toggleBtn) {
		toggleBtn.classList.toggle("is-visible", show);
		toggleBtn.setAttribute("aria-label", show ? "Hide password" : "Show password");
		toggleBtn.setAttribute("title", show ? "Hide password" : "Show password");
	}
}

async function loginUser(event){
	event.preventDefault();

	var form = event.target;
	var emailInput = form.querySelector("#email");
	var passwordInput = form.querySelector("#password");
	var email = emailInput ? emailInput.value : "";
	var password = passwordInput ? passwordInput.value : "";

	showAuthMessage("", "error");

	var submitBtn = form.querySelector("[type='submit']");
	if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Signing in…"; }

	try {
		var response = await fetch(API_BASE_URL + "/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: email, password: password })
		});

		var data = await response.json().catch(function(){ return {}; });

		if (!response.ok){
			showAuthMessage(data.message || "Invalid email or password.", "error");
			if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Sign In"; }
			return;
		}

		localStorage.setItem("coreinventory_token", data.token || "");
		localStorage.setItem("coreinventory_user", JSON.stringify(data.user || {}));
		window.location.href = "dashboard.html";
	} catch (_error) {
		showAuthMessage("Cannot reach the server. Please check your connection.", "error");
		if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Sign In"; }
	}
}

async function signupUser(){
	var nameInput = document.getElementById("name");
	var emailInput = document.getElementById("email");
	var passwordInput = document.getElementById("password");
	var name = nameInput ? nameInput.value.trim() : "";
	var email = emailInput ? emailInput.value.trim() : "";
	var password = passwordInput ? passwordInput.value : "";

	if (!email || !password){
		showAuthMessage("Email and password are required to create an account.", "error");
		return;
	}

	var signupBtn = document.getElementById("signupBtn");
	if (signupBtn) { signupBtn.disabled = true; signupBtn.textContent = "Creating..."; }

	try {
		var response = await fetch(API_BASE_URL + "/auth/signup", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: name, email: email, password: password })
		});

		var data = await response.json().catch(function(){ return {}; });
		if (!response.ok){
			showAuthMessage(data.message || "Signup failed. Please try again.", "error");
			if (signupBtn) { signupBtn.disabled = false; signupBtn.textContent = "Create Account"; }
			return;
		}

		localStorage.setItem("coreinventory_token", data.token || "");
		localStorage.setItem("coreinventory_user", JSON.stringify(data.user || {}));
		showAuthMessage("Account created successfully. Redirecting...", "success");
		window.location.href = "dashboard.html";
	} catch (_error) {
		showAuthMessage("Cannot reach the server. Please try again.", "error");
		if (signupBtn) { signupBtn.disabled = false; signupBtn.textContent = "Create Account"; }
	}
}

async function requestPasswordReset(){
	var emailInput = document.getElementById("email");
	var email = emailInput ? emailInput.value : "";

	if (!email){
		showAuthMessage("Please enter your email address first.", "error");
		return;
	}

	try {
		var response = await fetch(API_BASE_URL + "/auth/request-otp", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: email })
		});

		if (!response.ok){
			showAuthMessage("Unable to request OTP. Please try again.", "error");
			return;
		}

		var data = await response.json();
		showAuthMessage("OTP sent. Use code: " + (data.otp || "123456") + " - enter it above and sign in.", "success");
	} catch (_error) {
		showAuthMessage("Cannot reach the server. OTP flow unavailable.", "error");
	}
}

function requireAuth(){
	var token = localStorage.getItem("coreinventory_token");
	if (!token){
		window.location.replace("login.html");
	}
}

function logout(){
	localStorage.removeItem("coreinventory_token");
	localStorage.removeItem("coreinventory_user");
	window.location.href = "login.html";
}

function getStoredUser(){
	try {
		return JSON.parse(localStorage.getItem("coreinventory_user") || "{}") || {};
	} catch (_error) {
		return {};
	}
}

function fillProfileFields(user){
	var nameInput = document.getElementById("profileName");
	var emailInput = document.getElementById("profileEmail");
	var roleInput = document.getElementById("profileRole");
	var idInput = document.getElementById("profileUserId");
	if (nameInput) { nameInput.value = user.name || ""; }
	if (emailInput) { emailInput.value = user.email || ""; }
	if (roleInput) { roleInput.value = user.role || ""; }
	if (idInput) { idInput.value = user.id || ""; }

	var nameSummary = document.getElementById("profileSummaryName");
	var emailSummary = document.getElementById("profileSummaryEmail");
	if (nameSummary) { nameSummary.textContent = user.name || "Workspace User"; }
	if (emailSummary) { emailSummary.textContent = user.email || "No email available"; }
}

async function initProfilePage(){
	var form = document.getElementById("profileForm");
	if (!form) { return; }

	var user = getStoredUser();
	fillProfileFields(user);

	form.addEventListener("submit", function(event){
		event.preventDefault();
		var nextUser = {
			id: user.id || "",
			name: String(document.getElementById("profileName").value || "").trim(),
			email: user.email || "",
			role: String(document.getElementById("profileRole").value || "").trim()
		};
		localStorage.setItem("coreinventory_user", JSON.stringify(nextUser));
		user = nextUser;
		fillProfileFields(user);
		setInlineMessage("profileFeedback", "Profile details saved locally.", "success");
	});

	try {
		var results = await Promise.all([
			apiRequest("/tasks"),
			apiRequest("/products"),
			apiRequest("/operations")
		]);

		var tasks = results[0] || [];
		var products = results[1] || [];
		var operations = results[2] || [];
		var openTasks = tasks.filter(function(task){ return task.status !== "done"; }).length;
		var openOperations = operations.filter(function(op){ return !["Done", "Canceled"].includes(op.status); }).length;

		var openTasksEl = document.getElementById("profileOpenTasks");
		var productsEl = document.getElementById("profileProducts");
		var operationsEl = document.getElementById("profileOpenOperations");
		if (openTasksEl) { openTasksEl.textContent = String(openTasks); }
		if (productsEl) { productsEl.textContent = String(products.length); }
		if (operationsEl) { operationsEl.textContent = String(openOperations); }
	} catch (_error) {
		["profileOpenTasks", "profileProducts", "profileOpenOperations"].forEach(function(id){
			var node = document.getElementById(id);
			if (node) { node.textContent = "-"; }
		});
	}
}

function toggleSidebar(){
	document.body.classList.toggle("body-menu-open");
}

function ensureConfirmModal(){
	var existing = document.getElementById("confirmActionModal");
	if (existing) { return existing; }

	var modal = document.createElement("div");
	modal.className = "app-modal-backdrop";
	modal.id = "confirmActionModal";
	modal.setAttribute("aria-hidden", "true");
	modal.innerHTML = [
		'<div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="confirmActionTitle">',
		'<div class="card-head">',
		'<h2 id="confirmActionTitle">Please Confirm</h2>',
		'<button type="button" class="table-btn" id="confirmActionCloseBtn">Close</button>',
		'</div>',
		'<p id="confirmActionText" class="panel-copy"></p>',
		'<div class="app-modal-actions">',
		'<button type="button" class="ci-btn ci-btn-ghost ci-btn-small" id="confirmActionNoBtn">No</button>',
		'<button type="button" class="ci-btn ci-btn-primary ci-btn-small" id="confirmActionYesBtn">Yes</button>',
		'</div>',
		'</div>'
	].join("");

	document.body.appendChild(modal);
	return modal;
}

function showConfirmDialog(message, confirmLabel){
	return new Promise(function(resolve){
		var modal = ensureConfirmModal();
		var closeBtn = document.getElementById("confirmActionCloseBtn");
		var noBtn = document.getElementById("confirmActionNoBtn");
		var yesBtn = document.getElementById("confirmActionYesBtn");
		var text = document.getElementById("confirmActionText");

		text.textContent = message || "Are you sure?";
		yesBtn.textContent = confirmLabel || "Yes";

		function close(result){
			modal.classList.remove("is-open");
			modal.setAttribute("aria-hidden", "true");
			modal.removeEventListener("click", onBackdropClick);
			closeBtn.removeEventListener("click", onCancel);
			noBtn.removeEventListener("click", onCancel);
			yesBtn.removeEventListener("click", onConfirm);
			document.removeEventListener("keydown", onKeydown);
			resolve(result);
		}

		function onCancel(){ close(false); }
		function onConfirm(){ close(true); }
		function onBackdropClick(event){
			if (event.target === modal) {
				close(false);
			}
		}
		function onKeydown(event){
			if (event.key === "Escape") {
				close(false);
			}
		}

		modal.classList.add("is-open");
		modal.setAttribute("aria-hidden", "false");
		closeBtn.addEventListener("click", onCancel);
		noBtn.addEventListener("click", onCancel);
		yesBtn.addEventListener("click", onConfirm);
		modal.addEventListener("click", onBackdropClick);
		document.addEventListener("keydown", onKeydown);
	});
}

async function apiRequest(path, options){
	var response = await fetch(API_BASE_URL + path, options || {});
	var data = await response.json().catch(function(){ return null; });

	if (!response.ok){
		var message = data && data.message ? data.message : "Request failed";
		throw new Error(message);
	}

	return data;
}

function escapeHtml(value){
	return String(value == null ? "" : value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function operationTypeLabel(type){
	if (type === "receipts") { return "Receipt"; }
	if (type === "delivery") { return "Delivery"; }
	if (type === "internal") { return "Transfer"; }
	if (type === "adjustment") { return "Adjustment"; }
	return type || "Operation";
}

function statusTagClass(status){
	var value = String(status || "draft").toLowerCase();
	if (value === "waiting") { return "waiting"; }
	if (value === "ready") { return "ready"; }
	if (value === "done") { return "done"; }
	if (value === "canceled") { return "canceled"; }
	return "draft";
}

function formatTag(status){
	return '<span class="tag ' + statusTagClass(status) + '">' + escapeHtml(status || "Draft") + '</span>';
}

function formatDateTime(value){
	if (!value || value === "Completed") {
		return value || "-";
	}

	var date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return date.toLocaleString([], {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit"
	});
}

function formatQuantity(qty){
	var value = Number(qty || 0);
	if (value > 0) {
		return "+" + value;
	}
	return String(value);
}

function setInlineMessage(elementId, message, type){
	var target = document.getElementById(elementId);
	if (!target) { return; }

	target.textContent = message || "";
	target.className = "app-inline-message" + (message ? " is-visible is-" + (type || "info") : "");
}

function populateSelect(select, items, placeholder, mapper){
	if (!select) { return; }

	var options = [];
	if (placeholder !== undefined) {
		options.push('<option value="">' + escapeHtml(placeholder) + '</option>');
	}

	items.forEach(function(item){
		var mapped = mapper(item);
		options.push('<option value="' + escapeHtml(mapped.value) + '">' + escapeHtml(mapped.label) + '</option>');
	});

	select.innerHTML = options.join("");
}

function fillOperationSelects(){
	var productSelects = document.querySelectorAll(".product-select");
	var warehouseSelects = document.querySelectorAll(".warehouse-select");

	productSelects.forEach(function(select){
		populateSelect(select, appState.products, "Select product", function(product){
			return {
				value: product.id,
				label: product.name + " (" + product.sku + ")"
			};
		});
	});

	warehouseSelects.forEach(function(select){
		populateSelect(select, appState.warehouses, "Select warehouse", function(warehouse){
			return { value: warehouse, label: warehouse };
		});
	});
}

function renderStockSnapshot(){
	var container = document.getElementById("stockSnapshot");
	if (!container) { return; }

	if (!appState.products.length) {
		container.innerHTML = '<p class="empty-state">No products found.</p>';
		return;
	}

	container.innerHTML = appState.products.slice(0, 4).map(function(product){
		var locations = Object.keys(product.stockByLocation || {}).map(function(location){
			return '<span>' + escapeHtml(location) + ': <strong>' + escapeHtml(product.stockByLocation[location]) + ' ' + escapeHtml(product.uom || "") + '</strong></span>';
		}).join("");

		return [
			'<article class="snapshot-card">',
			'<h3>' + escapeHtml(product.name) + '</h3>',
			'<p>' + escapeHtml(product.sku) + ' · Reorder at ' + escapeHtml(product.reorderLevel) + ' ' + escapeHtml(product.uom || "") + '</p>',
			'<div class="snapshot-locations">' + locations + '</div>',
			'</article>'
		].join("");
	}).join("");
}

function renderOperationsSummary(products, operations, moves){
	var totalProductsEl = document.getElementById("opsTotalProducts");
	var openDocumentsEl = document.getElementById("opsOpenDocuments");
	var movesTodayEl = document.getElementById("opsMovesToday");
	if (!totalProductsEl || !openDocumentsEl || !movesTodayEl) { return; }

	var today = new Date().toDateString();
	var todayCount = moves.filter(function(move){
		return move.createdAt && new Date(move.createdAt).toDateString() === today;
	}).length;

	totalProductsEl.textContent = String(products.length);
	openDocumentsEl.textContent = String(operations.filter(function(item){ return String(item.status).toLowerCase() !== "done"; }).length);
	movesTodayEl.textContent = String(todayCount);
}

function renderOperationsQueue(operations){
	var tbody = document.getElementById("operationsQueueBody");
	if (!tbody) { return; }

	if (!operations.length) {
		tbody.innerHTML = '<tr><td colspan="7">No operations logged yet.</td></tr>';
		return;
	}

	tbody.innerHTML = operations.slice(0, 8).map(function(item){
		var route = (item.from && item.from !== "-" ? item.from : "Start") + " -> " + (item.to && item.to !== "-" ? item.to : item.warehouse || "-");
		var canCancel = String(item.status).toLowerCase() !== "canceled";
		return [
			"<tr>",
			"<td>" + escapeHtml(item.ref) + "</td>",
			"<td>" + escapeHtml(operationTypeLabel(item.type)) + "</td>",
			"<td>" + escapeHtml(item.product || "-") + "</td>",
			"<td>" + escapeHtml(route) + "</td>",
			"<td>" + escapeHtml(formatQuantity(item.quantity)) + "</td>",
			"<td>" + formatTag(item.status) + "</td>",
			"<td><div class='table-actions'><button type='button' class='table-btn operation-edit-btn' data-op-id='" + escapeHtml(item.id) + "'>Edit</button><button type='button' class='table-btn table-btn-danger operation-cancel-btn' data-op-id='" + escapeHtml(item.id) + "'" + (canCancel ? "" : " disabled") + ">Cancel</button></div></td>",
			"</tr>"
		].join("");
	}).join("");
}

async function refreshOperationsPage(){
	var results = await Promise.all([
		apiRequest("/products"),
		apiRequest("/settings/warehouses"),
		apiRequest("/operations"),
		apiRequest("/moves")
	]);

	appState.products = results[0] || [];
	appState.warehouses = (results[1] && results[1].warehouses) || [];
	appState.operations = results[2] || [];
	appState.moves = results[3] || [];

	fillOperationSelects();
	renderStockSnapshot();
	renderOperationsSummary(appState.products, appState.operations, appState.moves);
	renderOperationsQueue(appState.operations);
}

function findOperationById(operationId){
	return appState.operations.find(function(operation){ return operation.id === operationId; }) || null;
}

function toggleOperationEditModal(isOpen){
	var modal = document.getElementById("operationEditModal");
	if (!modal) { return; }
	modal.classList.toggle("is-open", !!isOpen);
	modal.setAttribute("aria-hidden", isOpen ? "false" : "true");
}

function bindOperationEditModal(){
	var form = document.getElementById("operationEditForm");
	if (form && !form.dataset.bound) {
		form.dataset.bound = "1";
		form.addEventListener("submit", submitOperationEditForm);
	}

	var closeBtn = document.getElementById("operationModalCloseBtn");
	if (closeBtn && !closeBtn.dataset.bound) {
		closeBtn.dataset.bound = "1";
		closeBtn.addEventListener("click", function(){
			toggleOperationEditModal(false);
		});
	}

	var modal = document.getElementById("operationEditModal");
	if (modal && !modal.dataset.bound) {
		modal.dataset.bound = "1";
		modal.addEventListener("click", function(event){
			if (event.target === modal) {
				toggleOperationEditModal(false);
			}
		});
	}
}

function fillOperationEditForm(operation){
	document.getElementById("operationEditId").value = operation.id || "";
	document.getElementById("operationEditRef").value = operation.ref || "";
	document.getElementById("operationEditStatus").value = operation.status || "Draft";
	document.getElementById("operationEditPartner").value = operation.partnerName || "";
	document.getElementById("operationEditOperator").value = operation.operator || "";
	document.getElementById("operationEditReason").value = operation.reason || "";
	document.getElementById("operationEditNote").value = operation.note || "";
	setInlineMessage("operationModalFeedback", "", "info");
}

async function submitOperationEditForm(event){
	event.preventDefault();
	var operationId = document.getElementById("operationEditId").value;
	if (!operationId) { return; }

	var submitBtn = document.getElementById("operationEditSubmitBtn");
	if (submitBtn) {
		submitBtn.disabled = true;
		submitBtn.textContent = "Updating...";
	}

	try {
		await apiRequest("/operations/" + encodeURIComponent(operationId), {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				status: document.getElementById("operationEditStatus").value,
				partnerName: document.getElementById("operationEditPartner").value.trim(),
				operator: document.getElementById("operationEditOperator").value.trim(),
				reason: document.getElementById("operationEditReason").value.trim(),
				note: document.getElementById("operationEditNote").value.trim()
			})
		});

		await refreshOperationsPage();
		toggleOperationEditModal(false);
		setInlineMessage("operationsFeedback", "Operation updated successfully.", "success");
	} catch (error) {
		setInlineMessage("operationModalFeedback", error.message || "Unable to update operation.", "error");
	} finally {
		if (submitBtn) {
			submitBtn.disabled = false;
			submitBtn.textContent = "Update Operation";
		}
	}
}

async function editOperation(operationId){
	var operation = findOperationById(operationId);
	if (!operation) { return; }
	fillOperationEditForm(operation);
	toggleOperationEditModal(true);
}

async function cancelOperation(operationId){
	var operation = findOperationById(operationId);
	if (!operation) { return; }
	var shouldCancel = await showConfirmDialog(
		"Cancel " + operation.ref + " and reverse its stock movement?",
		"Cancel Operation"
	);
	if (!shouldCancel) { return; }

	try {
		await apiRequest("/operations/" + encodeURIComponent(operationId) + "/cancel", {
			method: "POST"
		});

		await refreshOperationsPage();
		setInlineMessage("operationsFeedback", "Operation canceled and stock reversed.", "success");
	} catch (error) {
		setInlineMessage("operationsFeedback", error.message || "Unable to cancel operation.", "error");
	}
}

function getProductCategoryMap(){
	var map = {};
	appState.products.forEach(function(product){
		map[product.id] = product.category;
	});
	return map;
}

function populateDashboardFilters(){
	var categories = [];
	var seen = {};
	appState.products.forEach(function(product){
		if (!seen[product.category]) {
			seen[product.category] = true;
			categories.push(product.category);
		}
	});

	populateSelect(document.getElementById("dashboardWarehouseFilter"), appState.warehouses, "All Warehouses", function(warehouse){
		return { value: warehouse, label: warehouse };
	});

	populateSelect(document.getElementById("dashboardCategoryFilter"), categories, "All Categories", function(category){
		return { value: category, label: category };
	});
}

function getFilteredDashboardQueue(){
	var typeFilter = document.getElementById("dashboardTypeFilter");
	var statusFilter = document.getElementById("dashboardStatusFilter");
	var warehouseFilter = document.getElementById("dashboardWarehouseFilter");
	var categoryFilter = document.getElementById("dashboardCategoryFilter");
	var categoryMap = getProductCategoryMap();

	return (appState.dashboard && appState.dashboard.queue ? appState.dashboard.queue : []).filter(function(item){
		if (typeFilter && typeFilter.value && item.type !== typeFilter.value) { return false; }
		if (statusFilter && statusFilter.value && item.status !== statusFilter.value) { return false; }
		if (warehouseFilter && warehouseFilter.value && String(item.warehouse).indexOf(warehouseFilter.value) === -1) { return false; }
		if (categoryFilter && categoryFilter.value && categoryMap[item.productId] !== categoryFilter.value) { return false; }
		return true;
	});
}

function renderDashboardQueue(queue){
	var tbody = document.getElementById("dashboardQueueBody");
	if (!tbody) { return; }

	if (!queue.length) {
		tbody.innerHTML = '<tr><td colspan="5">No operations match the current filters.</td></tr>';
		return;
	}

	tbody.innerHTML = queue.map(function(item){
		return [
			"<tr>",
			"<td>" + escapeHtml(item.ref) + "</td>",
			"<td>" + escapeHtml(operationTypeLabel(item.type)) + "</td>",
			"<td>" + escapeHtml(item.warehouse || "-") + "</td>",
			"<td>" + formatTag(item.status) + "</td>",
			"<td>" + escapeHtml(formatDateTime(item.eta)) + "</td>",
			"</tr>"
		].join("");
	}).join("");
}

function renderDashboardKpis(summary){
	if (!summary || !summary.kpis) { return; }
	var kpis = summary.kpis;
	var mapping = {
		dashboardTotalStock: kpis.totalProductsInStock,
		dashboardLowStock: kpis.lowOrOutOfStockItems,
		dashboardPendingReceipts: kpis.pendingReceipts,
		dashboardPendingDeliveries: kpis.pendingDeliveries,
		dashboardInternalTransfers: kpis.internalTransfersScheduled
	};

	Object.keys(mapping).forEach(function(id){
		var element = document.getElementById(id);
		if (element) {
			element.textContent = String(mapping[id]);
		}
	});
}

async function initDashboardPage(){
	if (!document.getElementById("dashboardQueueBody")) { return; }

	var results = await Promise.all([
		apiRequest("/dashboard"),
		apiRequest("/products"),
		apiRequest("/settings/warehouses")
	]);

	appState.dashboard = results[0] || { kpis: {}, queue: [] };
	appState.products = results[1] || [];
	appState.warehouses = (results[2] && results[2].warehouses) || [];

	renderDashboardKpis(appState.dashboard);
	populateDashboardFilters();
	renderDashboardQueue(getFilteredDashboardQueue());

	["dashboardTypeFilter", "dashboardStatusFilter", "dashboardWarehouseFilter", "dashboardCategoryFilter"].forEach(function(id){
		var element = document.getElementById(id);
		if (element) {
			element.addEventListener("change", function(){
				renderDashboardQueue(getFilteredDashboardQueue());
			});
		}
	});
}

function getProductHealthTag(product){
	var total = Object.keys(product.stockByLocation || {}).reduce(function(sum, location){
		return sum + Number(product.stockByLocation[location] || 0);
	}, 0);
	var reorder = Number(product.reorderLevel || 0);
	if (total <= reorder) {
		return { label: "Low Stock", className: "draft" };
	}
	if (total <= reorder * 1.5) {
		return { label: "Reorder Soon", className: "waiting" };
	}
	return { label: "Healthy", className: "done" };
}

function getVisibleProductColumns(){
	var warehouseView = document.getElementById("productWarehouseView");
	var selection = warehouseView ? warehouseView.value : "all";
	if (selection && selection !== "all") {
		return [selection, "Network Total"];
	}
	return [appState.warehouses[0] || "Main Warehouse", appState.warehouses[1] || "Production Floor"];
}

function updateProductHeaders(){
	var columns = getVisibleProductColumns();
	var header1 = document.getElementById("productsWarehouseHeader1");
	var header2 = document.getElementById("productsWarehouseHeader2");
	if (header1) { header1.textContent = columns[0]; }
	if (header2) { header2.textContent = columns[1]; }
}

function getFilteredProducts(){
	var search = document.getElementById("productSearch");
	var category = document.getElementById("productCategoryFilter");
	var stockFilter = document.getElementById("productStockFilter");
	var query = search ? String(search.value || "").toLowerCase() : "";

	return appState.products.filter(function(product){
		if (query) {
			var haystack = [product.name, product.sku, product.category].join(" ").toLowerCase();
			if (haystack.indexOf(query) === -1) { return false; }
		}
		if (category && category.value && product.category !== category.value) { return false; }
		if (stockFilter && stockFilter.value) {
			var health = getProductHealthTag(product);
			if (stockFilter.value === "healthy" && health.className !== "done") { return false; }
			if (stockFilter.value === "reorder" && health.className !== "waiting") { return false; }
			if (stockFilter.value === "low" && health.className !== "draft") { return false; }
		}
		return true;
	});
}

function renderProductsTable(products){
	var tbody = document.getElementById("productsTableBody");
	if (!tbody) { return; }

	updateProductHeaders();

	if (!products.length) {
		tbody.innerHTML = '<tr><td colspan="7">No products match the current filters.</td></tr>';
		return;
	}

	var columns = getVisibleProductColumns();
	tbody.innerHTML = products.map(function(product){
		var health = getProductHealthTag(product);
		var firstValue = columns[0] === "Network Total"
			? Object.keys(product.stockByLocation || {}).reduce(function(sum, location){ return sum + Number(product.stockByLocation[location] || 0); }, 0)
			: Number((product.stockByLocation || {})[columns[0]] || 0);
		var secondValue = columns[1] === "Network Total"
			? Object.keys(product.stockByLocation || {}).reduce(function(sum, location){ return sum + Number(product.stockByLocation[location] || 0); }, 0)
			: Number((product.stockByLocation || {})[columns[1]] || 0);

		return [
			"<tr>",
			"<td>" + escapeHtml(product.name) + "</td>",
			"<td>" + escapeHtml(product.sku) + "</td>",
			"<td>" + escapeHtml(product.category) + "</td>",
			"<td>" + escapeHtml(firstValue) + " " + escapeHtml(product.uom) + "</td>",
			"<td>" + escapeHtml(secondValue) + " " + escapeHtml(product.uom) + "</td>",
			"<td><span class='tag " + health.className + "'>" + escapeHtml(health.label) + "</span></td>",
			"<td><div class='table-actions'><button type='button' class='table-btn product-edit-btn' data-product-id='" + escapeHtml(product.id) + "'>Edit</button></div></td>",
			"</tr>"
		].join("");
	}).join("");
}

function populateProductFilters(){
	var categories = [];
	var seen = {};
	appState.products.forEach(function(product){
		if (!seen[product.category]) {
			seen[product.category] = true;
			categories.push(product.category);
		}
	});

	populateSelect(document.getElementById("productCategoryFilter"), categories, "All Categories", function(category){
		return { value: category, label: category };
	});

	populateSelect(document.getElementById("productWarehouseView"), [{ value: "all", label: "All Warehouses" }].concat(appState.warehouses.map(function(warehouse){
		return { value: warehouse, label: warehouse };
	})), undefined, function(item){ return item; });
	var warehouseView = document.getElementById("productWarehouseView");
	if (warehouseView && !warehouseView.value) {
		warehouseView.value = "all";
	}
}

function resetProductForm(){
	var form = document.getElementById("productForm");
	if (!form) { return; }
	form.reset();
	var productId = document.getElementById("productId");
	if (productId) { productId.value = ""; }
	var title = document.getElementById("productFormTitle");
	if (title) { title.textContent = "Create Product"; }
	var cancelBtn = document.getElementById("productCancelEditBtn");
	if (cancelBtn) { cancelBtn.classList.add("is-hidden"); }
	var submitBtn = document.getElementById("productSubmitBtn");
	if (submitBtn) { submitBtn.textContent = "Save Product"; }
	setInlineMessage("productFeedback", "", "info");
}

function startProductEdit(productId){
	var product = appState.products.find(function(item){ return item.id === productId; });
	if (!product) { return; }

	document.getElementById("productId").value = product.id;
	document.getElementById("productName").value = product.name || "";
	document.getElementById("productSku").value = product.sku || "";
	document.getElementById("productCategory").value = product.category || "";
	document.getElementById("productUom").value = product.uom || "";
	document.getElementById("productInitialStock").value = "";
	document.getElementById("productReorderLevel").value = product.reorderLevel || 0;
	document.getElementById("productFormTitle").textContent = "Edit Product";
	document.getElementById("productCancelEditBtn").classList.remove("is-hidden");
	document.getElementById("productSubmitBtn").textContent = "Update Product";
	setInlineMessage("productFeedback", "Editing " + product.name + ". Initial stock is used only for new products.", "success");
	var formCard = document.getElementById("productForm").closest(".form-card");
	if (formCard) { formCard.scrollIntoView({ behavior: "smooth", block: "start" }); }
}

async function refreshProductsPage(){
	var results = await Promise.all([
		apiRequest("/products"),
		apiRequest("/settings/warehouses")
	]);
	appState.products = results[0] || [];
	appState.warehouses = (results[1] && results[1].warehouses) || [];
	populateProductFilters();
	renderProductsTable(getFilteredProducts());
}

async function submitProductForm(event){
	event.preventDefault();
	var form = event.target;
	var submitBtn = document.getElementById("productSubmitBtn");
	var productId = document.getElementById("productId").value;
	var initialWarehouse = appState.warehouses[0] || "Main Warehouse";
	var payload = {
		name: document.getElementById("productName").value.trim(),
		sku: document.getElementById("productSku").value.trim(),
		category: document.getElementById("productCategory").value.trim(),
		uom: document.getElementById("productUom").value.trim(),
		reorderLevel: Number(document.getElementById("productReorderLevel").value || 0)
	};

	if (!productId) {
		var initialStock = Number(document.getElementById("productInitialStock").value || 0);
		payload.stockByLocation = {};
		payload.stockByLocation[initialWarehouse] = initialStock;
	}

	if (submitBtn) {
		submitBtn.disabled = true;
		submitBtn.textContent = productId ? "Updating..." : "Saving...";
	}

	try {
		await apiRequest(productId ? "/products/" + encodeURIComponent(productId) : "/products", {
			method: productId ? "PUT" : "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload)
		});

		await refreshProductsPage();
		resetProductForm();
		setInlineMessage("productFeedback", productId ? "Product updated successfully." : "Product created successfully.", "success");
	} catch (error) {
		setInlineMessage("productFeedback", error.message || "Unable to save product.", "error");
	} finally {
		if (submitBtn) {
			submitBtn.disabled = false;
			submitBtn.textContent = productId ? "Update Product" : "Save Product";
		}
	}
	form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function initProductsPage(){
	if (!document.getElementById("productsTableBody")) { return; }

	await refreshProductsPage();

	var form = document.getElementById("productForm");
	if (form) {
		form.addEventListener("submit", submitProductForm);
	}

	var shortcutBtn = document.getElementById("productSaveShortcut");
	if (shortcutBtn && form) {
		shortcutBtn.addEventListener("click", function(){
			form.requestSubmit();
		});
	}

	var cancelEditBtn = document.getElementById("productCancelEditBtn");
	if (cancelEditBtn) {
		cancelEditBtn.addEventListener("click", resetProductForm);
	}

	["productSearch", "productCategoryFilter", "productStockFilter", "productWarehouseView"].forEach(function(id){
		var element = document.getElementById(id);
		if (element) {
			element.addEventListener(id === "productSearch" ? "input" : "change", function(){
				renderProductsTable(getFilteredProducts());
			});
		}
	});
}

function getFormData(form){
	var raw = new FormData(form);
	var data = {};
	raw.forEach(function(value, key){
		data[key] = String(value || "").trim();
	});
	return data;
}

async function submitOperationForm(form, type, buildPayload){
	var button = form.querySelector("button[type='submit']");
	var originalLabel = button ? button.textContent : "Submit";
	setInlineMessage("operationsFeedback", "", "info");

	if (button) {
		button.disabled = true;
		button.textContent = "Saving...";
	}

	try {
		var formData = getFormData(form);
		var payload = buildPayload(formData);
		payload.type = type;

		await apiRequest("/operations", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload)
		});

		form.reset();
		await refreshOperationsPage();
		setInlineMessage("operationsFeedback", operationTypeLabel(type) + " logged successfully.", "success");
	} catch (error) {
		setInlineMessage("operationsFeedback", error.message || "Unable to save operation.", "error");
	} finally {
		if (button) {
			button.disabled = false;
			button.textContent = originalLabel;
		}
	}
}

function bindOperationForms(){
	var receiptForm = document.getElementById("receiptForm");
	var deliveryForm = document.getElementById("deliveryForm");
	var transferForm = document.getElementById("transferForm");
	var adjustmentForm = document.getElementById("adjustmentForm");

	if (receiptForm) {
		receiptForm.addEventListener("submit", function(event){
			event.preventDefault();
			submitOperationForm(receiptForm, "receipts", function(data){
				return {
					productId: data.productId,
					to: data.to,
					from: "Vendor",
					warehouse: data.to,
					quantity: Number(data.quantity),
					status: data.status,
					partnerName: data.partnerName,
					operator: data.operator,
					note: "Incoming goods receipt"
				};
			});
		});
	}

	if (deliveryForm) {
		deliveryForm.addEventListener("submit", function(event){
			event.preventDefault();
			submitOperationForm(deliveryForm, "delivery", function(data){
				return {
					productId: data.productId,
					from: data.from,
					to: data.partnerName || "Customer",
					warehouse: data.from,
					quantity: Number(data.quantity),
					status: data.status,
					partnerName: data.partnerName,
					operator: data.operator,
					note: "Outgoing delivery order"
				};
			});
		});
	}

	if (transferForm) {
		transferForm.addEventListener("submit", function(event){
			event.preventDefault();
			submitOperationForm(transferForm, "internal", function(data){
				return {
					productId: data.productId,
					from: data.from,
					to: data.to,
					warehouse: data.from + " -> " + data.to,
					quantity: Number(data.quantity),
					status: data.status,
					operator: data.operator,
					note: "Internal stock transfer"
				};
			});
		});
	}

	if (adjustmentForm) {
		adjustmentForm.addEventListener("submit", function(event){
			event.preventDefault();
			submitOperationForm(adjustmentForm, "adjustment", function(data){
				return {
					productId: data.productId,
					from: data.from,
					to: data.reason || "Adjustment",
					warehouse: data.from,
					quantity: Number(data.quantity),
					status: data.status,
					reason: data.reason,
					operator: data.operator,
					note: "Stock audit adjustment"
				};
			});
		});
	}
}

function renderMovesTable(moves){
	var tbody = document.getElementById("movesTableBody");
	if (!tbody) { return; }

	if (!moves.length) {
		tbody.innerHTML = '<tr><td colspan="8">No move history matches the selected filters.</td></tr>';
		return;
	}

	tbody.innerHTML = moves.map(function(move){
		return [
			"<tr>",
			"<td>" + escapeHtml(move.ref) + "</td>",
			"<td>" + escapeHtml(move.operation || operationTypeLabel(move.type)) + "</td>",
			"<td>" + escapeHtml(move.product) + "</td>",
			"<td>" + escapeHtml(move.from || "-") + "</td>",
			"<td>" + escapeHtml(move.to || "-") + "</td>",
			"<td>" + escapeHtml(formatQuantity(move.qty)) + "</td>",
			"<td>" + formatTag(move.status) + "</td>",
			"<td>" + escapeHtml(formatDateTime(move.createdAt)) + "</td>",
			"</tr>"
		].join("");
	}).join("");
}

function renderMovesSummary(moves){
	var total = document.getElementById("movesTotalCount");
	var done = document.getElementById("movesDoneCount");
	var warehouses = document.getElementById("movesWarehouseCount");
	if (!total || !done || !warehouses) { return; }

	var touched = {};
	moves.forEach(function(move){
		if (move.warehouse) {
			touched[move.warehouse] = true;
		}
	});

	total.textContent = String(moves.length);
	done.textContent = String(moves.filter(function(move){ return String(move.status).toLowerCase() === "done"; }).length);
	warehouses.textContent = String(Object.keys(touched).length);
}

function getFilteredMoves(){
	var typeValue = document.getElementById("movesTypeFilter");
	var statusValue = document.getElementById("movesStatusFilter");
	var warehouseValue = document.getElementById("movesWarehouseFilter");
	var dateValue = document.getElementById("movesDateFilter");

	return appState.moves.filter(function(move){
		if (typeValue && typeValue.value && move.type !== typeValue.value) {
			return false;
		}
		if (statusValue && statusValue.value && String(move.status).toLowerCase() !== String(statusValue.value).toLowerCase()) {
			return false;
		}
		if (warehouseValue && warehouseValue.value && move.warehouse !== warehouseValue.value) {
			return false;
		}
		if (dateValue && dateValue.value) {
			var moveDate = move.createdAt ? new Date(move.createdAt).toISOString().slice(0, 10) : "";
			if (moveDate !== dateValue.value) {
				return false;
			}
		}
		return true;
	});
}

function exportMovesCsv(mode){
	var exportMode = mode || "filtered";
	var rows = exportMode === "all" ? appState.moves.slice() : getFilteredMoves();

	if (!rows.length) {
		setInlineMessage(
			"movesExportFeedback",
			exportMode === "all" ? "No move history is available to export." : "No rows match the current filters. Use Export All to download the full history.",
			"error"
		);
		return;
	}

	var csv = ["Ref,Operation,Product,From,To,Qty,Status,Warehouse,Created At"];
	rows.forEach(function(move){
		csv.push([
			move.ref,
			move.operation || operationTypeLabel(move.type),
			move.product,
			move.from || "",
			move.to || "",
			move.qty,
			move.status,
			move.warehouse || "",
			move.createdAt || ""
		].map(function(value){
			return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
		}).join(","));
	});

	var blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8;" });
	var url = URL.createObjectURL(blob);
	var link = document.createElement("a");
	link.href = url;
	link.download = "coreinventory-moves-" + new Date().toISOString().slice(0, 10) + ".csv";
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	window.setTimeout(function(){
		URL.revokeObjectURL(url);
	}, 1000);
	setInlineMessage(
		"movesExportFeedback",
		exportMode === "all" ? "Full move history exported successfully." : "Filtered move history exported successfully.",
		"success"
	);
}

function bindMoveFilters(){
	["movesTypeFilter", "movesStatusFilter", "movesWarehouseFilter", "movesDateFilter"].forEach(function(id){
		var element = document.getElementById(id);
		if (!element) { return; }
		element.addEventListener("change", function(){
			renderMovesTable(getFilteredMoves());
			setInlineMessage("movesExportFeedback", "", "info");
		});
	});

	var exportFilteredBtn = document.getElementById("exportFilteredMovesBtn");
	if (exportFilteredBtn) {
		exportFilteredBtn.addEventListener("click", function(){
			exportMovesCsv("filtered");
		});
	}

	var exportAllBtn = document.getElementById("exportAllMovesBtn");
	if (exportAllBtn) {
		exportAllBtn.addEventListener("click", function(){
			exportMovesCsv("all");
		});
	}
}

async function initOperationsPage(){
	if (!document.getElementById("receiptForm")) { return; }

	bindOperationForms();
	bindOperationEditModal();
	try {
		await refreshOperationsPage();
	} catch (error) {
		setInlineMessage("operationsFeedback", error.message || "Unable to load operations data.", "error");
	}
}

function renderReportsKpis(payload, warehouseCount){
	var lowStockKpi = document.getElementById("reportsLowStockKpi");
	var warehouseKpi = document.getElementById("reportsWarehouseKpi");
	var skuKpi = document.getElementById("reportsSkuKpi");
	if (lowStockKpi) { lowStockKpi.textContent = String((payload.alerts && payload.alerts.lowStock) || 0) + " threshold"; }
	if (warehouseKpi) { warehouseKpi.textContent = String(warehouseCount || 0) + " locations"; }
	if (skuKpi) { skuKpi.textContent = String(payload.skuSearchAccuracy || 0) + "%"; }
}

function fillReportsSettingsForm(payload, warehouses){
	var low = document.getElementById("settingsLowStock");
	var out = document.getElementById("settingsOutOfStock");
	var sku = document.getElementById("settingsSkuAccuracy");
	var list = document.getElementById("settingsWarehouses");
	if (low) { low.value = (payload.alerts && payload.alerts.lowStock) || 0; }
	if (out) { out.value = (payload.alerts && payload.alerts.outOfStock) || 0; }
	if (sku) { sku.value = payload.skuSearchAccuracy || 0; }
	if (list) { list.value = (warehouses || []).join(", "); }
}

function taskTagClass(status, priority){
	if (status === "done") { return "done"; }
	if (status === "in_progress") { return "ready"; }
	if (priority === "high") { return "waiting"; }
	return "draft";
}

function formatTaskStatus(status){
	if (status === "in_progress") { return "In Progress"; }
	if (status === "done") { return "Done"; }
	return "Todo";
}

function resetTaskForm(){
	var form = document.getElementById("taskForm");
	if (!form) { return; }
	form.reset();
	document.getElementById("taskId").value = "";
	var submitBtn = document.getElementById("taskSubmitBtn");
	if (submitBtn) { submitBtn.textContent = "Save Task"; }
	var cancelBtn = document.getElementById("taskCancelEditBtn");
	if (cancelBtn) { cancelBtn.classList.add("is-hidden"); }
}

function startTaskEdit(taskId){
	var task = appState.tasks.find(function(item){ return item.id === taskId; });
	if (!task) { return; }
	document.getElementById("taskId").value = task.id;
	document.getElementById("taskTitle").value = task.title || "";
	document.getElementById("taskAssignee").value = task.assignee || "";
	document.getElementById("taskStatus").value = task.status || "todo";
	document.getElementById("taskPriority").value = task.priority || "medium";
	document.getElementById("taskDueDate").value = task.dueDate || "";
	document.getElementById("taskDescription").value = task.description || "";
	document.getElementById("taskSubmitBtn").textContent = "Update Task";
	document.getElementById("taskCancelEditBtn").classList.remove("is-hidden");
	setInlineMessage("tasksFeedback", "Editing task: " + (task.title || ""), "success");
}

function getFilteredTasks(){
	var search = document.getElementById("tasksSearch");
	var status = document.getElementById("tasksStatusFilter");
	var priority = document.getElementById("tasksPriorityFilter");
	var sort = document.getElementById("tasksSort");
	var query = search ? String(search.value || "").toLowerCase() : "";
	var filtered = appState.tasks.filter(function(task){
		if (query) {
			var haystack = [task.title, task.description, task.assignee].join(" ").toLowerCase();
			if (haystack.indexOf(query) === -1) { return false; }
		}
		if (status && status.value && task.status !== status.value) { return false; }
		if (priority && priority.value && task.priority !== priority.value) { return false; }
		return true;
	});

	var rank = { high: 3, medium: 2, low: 1 };
	filtered.sort(function(a, b){
		var key = sort ? sort.value : "updatedAt";
		if (key === "priority") {
			return (rank[b.priority] || 0) - (rank[a.priority] || 0);
		}
		if (key === "dueDate") {
			return String(a.dueDate || "9999-12-31").localeCompare(String(b.dueDate || "9999-12-31"));
		}
		return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
	});
	return filtered;
}

function renderTasksTable(tasks){
	var tbody = document.getElementById("tasksTableBody");
	if (!tbody) { return; }
	if (!tasks.length) {
		tbody.innerHTML = '<tr><td colspan="6">No tasks match the current filters.</td></tr>';
		return;
	}
	tbody.innerHTML = tasks.map(function(task){
		var cls = taskTagClass(task.status, task.priority);
		return [
			"<tr>",
			"<td>" + escapeHtml(task.title) + "</td>",
			"<td>" + escapeHtml(task.assignee || "-") + "</td>",
			"<td><span class='tag " + cls + "'>" + escapeHtml(formatTaskStatus(task.status)) + "</span></td>",
			"<td><span class='tag " + cls + "'>" + escapeHtml(String(task.priority || "medium").toUpperCase()) + "</span></td>",
			"<td>" + escapeHtml(task.dueDate || "-") + "</td>",
			"<td><div class='table-actions'><button type='button' class='table-btn task-edit-btn' data-task-id='" + escapeHtml(task.id) + "'>Edit</button><button type='button' class='table-btn table-btn-danger task-delete-btn' data-task-id='" + escapeHtml(task.id) + "'>Delete</button></div></td>",
			"</tr>"
		].join("");
	}).join("");
}

async function refreshTasks(){
	appState.tasks = await apiRequest("/tasks");
	renderTasksTable(getFilteredTasks());
}

async function submitTaskForm(event){
	event.preventDefault();
	var taskId = document.getElementById("taskId").value;
	var submitBtn = document.getElementById("taskSubmitBtn");
	if (submitBtn) {
		submitBtn.disabled = true;
		submitBtn.textContent = taskId ? "Updating..." : "Saving...";
	}

	var payload = {
		title: document.getElementById("taskTitle").value.trim(),
		description: document.getElementById("taskDescription").value.trim(),
		status: document.getElementById("taskStatus").value,
		priority: document.getElementById("taskPriority").value,
		assignee: document.getElementById("taskAssignee").value.trim(),
		dueDate: document.getElementById("taskDueDate").value || null
	};

	try {
		await apiRequest(taskId ? "/tasks/" + encodeURIComponent(taskId) : "/tasks", {
			method: taskId ? "PUT" : "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload)
		});
		await refreshTasks();
		resetTaskForm();
		setInlineMessage("tasksFeedback", taskId ? "Task updated successfully." : "Task created successfully.", "success");
	} catch (error) {
		setInlineMessage("tasksFeedback", error.message || "Unable to save task.", "error");
	} finally {
		if (submitBtn) {
			submitBtn.disabled = false;
			submitBtn.textContent = taskId ? "Update Task" : "Save Task";
		}
	}
}

async function deleteTaskById(taskId){
	var shouldDelete = await showConfirmDialog("Delete this task permanently?", "Delete Task");
	if (!shouldDelete) { return; }
	try {
		await apiRequest("/tasks/" + encodeURIComponent(taskId), { method: "DELETE" });
		await refreshTasks();
		setInlineMessage("tasksFeedback", "Task deleted successfully.", "success");
	} catch (error) {
		setInlineMessage("tasksFeedback", error.message || "Unable to delete task.", "error");
	}
}

async function submitReportsSettings(event){
	if (event) { event.preventDefault(); }
	var warehouses = String(document.getElementById("settingsWarehouses").value || "")
		.split(",")
		.map(function(item){ return item.trim(); })
		.filter(function(item){ return item.length > 0; });

	var payload = {
		alerts: {
			lowStock: Number(document.getElementById("settingsLowStock").value || 0),
			outOfStock: Number(document.getElementById("settingsOutOfStock").value || 0)
		},
		skuSearchAccuracy: Number(document.getElementById("settingsSkuAccuracy").value || 0),
		warehouses: warehouses
	};

	try {
		var updated = await apiRequest("/settings", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload)
		});
		appState.reportSettings = updated.settings || null;
		appState.warehouses = updated.warehouses || [];
		renderReportsKpis(appState.reportSettings || {}, appState.warehouses.length);
		fillReportsSettingsForm(appState.reportSettings || {}, appState.warehouses);
		setInlineMessage("reportsFeedback", "Settings saved successfully.", "success");
	} catch (error) {
		setInlineMessage("reportsFeedback", error.message || "Unable to save settings.", "error");
	}
}

async function initReportsPage(){
	if (!document.getElementById("reportsSettingsForm")) { return; }

	var results = await Promise.all([
		apiRequest("/reports/overview"),
		apiRequest("/settings/warehouses")
	]);

	appState.reportSettings = results[0] || {};
	appState.warehouses = (results[1] && results[1].warehouses) || [];

	renderReportsKpis(appState.reportSettings, appState.warehouses.length);
	fillReportsSettingsForm(appState.reportSettings, appState.warehouses);

	var settingsForm = document.getElementById("reportsSettingsForm");
	if (settingsForm) {
		settingsForm.addEventListener("submit", submitReportsSettings);
	}

	var saveBtn = document.getElementById("reportsSaveSettingsBtn");
	if (saveBtn) {
		saveBtn.addEventListener("click", submitReportsSettings);
	}
}

async function initWarehouseTasksPage(){
	if (!document.getElementById("taskForm")) { return; }

	appState.tasks = await apiRequest("/tasks");
	renderTasksTable(getFilteredTasks());

	var taskForm = document.getElementById("taskForm");
	taskForm.addEventListener("submit", submitTaskForm);

	var taskCancelEditBtn = document.getElementById("taskCancelEditBtn");
	if (taskCancelEditBtn) {
		taskCancelEditBtn.addEventListener("click", resetTaskForm);
	}

	["tasksSearch", "tasksStatusFilter", "tasksPriorityFilter", "tasksSort"].forEach(function(id){
		var element = document.getElementById(id);
		if (element) {
			element.addEventListener(id === "tasksSearch" ? "input" : "change", function(){
				renderTasksTable(getFilteredTasks());
			});
		}
	});
}

async function initMovesPage(){
	if (!document.getElementById("movesTableBody")) { return; }

	try {
		var results = await Promise.all([
			apiRequest("/moves"),
			apiRequest("/settings/warehouses")
		]);

		appState.moves = results[0] || [];
		appState.warehouses = (results[1] && results[1].warehouses) || [];

		populateSelect(document.getElementById("movesWarehouseFilter"), appState.warehouses, "All", function(warehouse){
			return { value: warehouse, label: warehouse };
		});

		renderMovesSummary(appState.moves);
		renderMovesTable(appState.moves);
		bindMoveFilters();
	} catch (_error) {
		renderMovesTable([]);
	}
}

document.addEventListener("DOMContentLoaded", function(){
	initOperationsPage();
	initMovesPage();
	initDashboardPage().catch(function(){ return null; });
	initProductsPage().catch(function(){ return null; });
	initReportsPage().catch(function(){ return null; });
	initWarehouseTasksPage().catch(function(){ return null; });
	initProfilePage().catch(function(){ return null; });
});

document.addEventListener("click", function(event){
	var operationEditBtn = event.target.closest(".operation-edit-btn");
	if (operationEditBtn) {
		editOperation(operationEditBtn.getAttribute("data-op-id"));
		return;
	}

	var operationCancelBtn = event.target.closest(".operation-cancel-btn");
	if (operationCancelBtn && !operationCancelBtn.disabled) {
		cancelOperation(operationCancelBtn.getAttribute("data-op-id"));
		return;
	}

	var productEditBtn = event.target.closest(".product-edit-btn");
	if (productEditBtn) {
		startProductEdit(productEditBtn.getAttribute("data-product-id"));
		return;
	}

	var taskEditBtn = event.target.closest(".task-edit-btn");
	if (taskEditBtn) {
		startTaskEdit(taskEditBtn.getAttribute("data-task-id"));
		return;
	}

	var taskDeleteBtn = event.target.closest(".task-delete-btn");
	if (taskDeleteBtn) {
		deleteTaskById(taskDeleteBtn.getAttribute("data-task-id"));
		return;
	}

	var sidebar = document.getElementById("appSidebar");
	var menuBtn = event.target.closest(".menu-btn");
	if (!sidebar || menuBtn || !document.body.classList.contains("body-menu-open")){
		return;
	}

	if (!sidebar.contains(event.target)){
		document.body.classList.remove("body-menu-open");
	}
});