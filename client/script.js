var API_BASE_URL = "http://localhost:5050/api";

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

function toggleSidebar(){
	document.body.classList.toggle("body-menu-open");
}

document.addEventListener("click", function(event){
	var sidebar = document.getElementById("appSidebar");
	var menuBtn = event.target.closest(".menu-btn");
	if (!sidebar || menuBtn || !document.body.classList.contains("body-menu-open")){
		return;
	}

	if (!sidebar.contains(event.target)){
		document.body.classList.remove("body-menu-open");
	}
});