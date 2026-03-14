var API_BASE_URL = "http://localhost:5050/api";

async function loginUser(event){
	event.preventDefault();

	var form = event.target;
	var emailInput = form.querySelector("#email");
	var passwordInput = form.querySelector("#password");
	var email = emailInput ? emailInput.value : "";
	var password = passwordInput ? passwordInput.value : "";

	try {
		var response = await fetch(API_BASE_URL + "/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: email, password: password })
		});

		if (!response.ok){
			var errorData = await response.json().catch(function(){ return {}; });
			alert(errorData.message || "Login failed");
			return;
		}

		var data = await response.json();
		localStorage.setItem("coreinventory_token", data.token || "");
		localStorage.setItem("coreinventory_user", JSON.stringify(data.user || {}));
		alert("Login successful. Redirecting to Dashboard.");
		window.location.href = "dashboard.html";
	} catch (_error) {
		// Fallback so demo still works if API server is not running.
		alert("Backend not reachable. Continuing in demo mode.");
		window.location.href = "dashboard.html";
	}
}

async function requestPasswordReset(){
	var emailInput = document.getElementById("email");
	var email = emailInput ? emailInput.value : "";

	if (!email){
		alert("Please enter email first.");
		return;
	}

	try {
		var response = await fetch(API_BASE_URL + "/auth/request-otp", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: email })
		});

		if (!response.ok){
			alert("Unable to request OTP now.");
			return;
		}

		var data = await response.json();
		alert("OTP requested. Demo OTP: " + (data.otp || "123456"));
	} catch (_error) {
		alert("Backend not reachable. OTP flow unavailable.");
	}
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