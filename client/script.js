function loginUser(event){
	event.preventDefault();
	alert("Login successful. Redirecting to Dashboard.");
	window.location.href = "dashboard.html";
}

function requestPasswordReset(){
	alert("OTP reset request submitted. Check your registered email.");
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