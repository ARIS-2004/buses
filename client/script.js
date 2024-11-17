document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const BACKEND_URL = "https://buses-7t2y.onrender.com";
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");
  const welcomeMessage = document.getElementById("user-welcome-message");
  const searchForm = document.getElementById("search-form");
  const bookingForm = document.getElementById("booking-form");
  const seatInfo = document.getElementById("seat-info");
fetch(`${BACKEND_URL}/api/endpoint`)
  .then((response) => response.json())
  .then((data) => console.log(data))
  .catch((error) => console.error("Error:", error));
  // Ensure the welcome message element exists before using it
  if (welcomeMessage) {
    const loggedInUser = localStorage.getItem("username");

    if (loggedInUser) {
      // Show welcome message and logout button
      welcomeMessage.innerText = `Hello, ${loggedInUser}!`;
      loginButton.style.display = "none";
      logoutButton.style.display = "inline-block";

      // Redirect if on login/signup pages
      if (
        window.location.pathname.endsWith("login.html") ||
        window.location.pathname.endsWith("signup.html")
      ) {
        window.location.href = "index.html";
        return;
      }
    } else {
      // Show login button and default message
      welcomeMessage.innerText = "Please log in to continue.";
      loginButton.style.display = "inline-block";
      logoutButton.style.display = "none";
    }

    // Logout functionality
    logoutButton.addEventListener("click", () => {
      localStorage.removeItem("username");
      window.location.href = "login.html";
    });
  } else {
    console.warn(
      "The element with id 'user-welcome-message' is missing in the DOM."
    );
  }

  // Login form submission
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = event.target.username.value;
      const password = event.target.password.value;
      try {
        const response = await fetch("http://localhost:5000/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });

        const result = await response.json();
        if (response.ok) {
          localStorage.setItem("username", result.username);
          window.location.href = "index.html"; // Redirect to the home page
        } else {
          document.getElementById("error-message").innerText = result.error;
          document.getElementById("error-message").style.display = "block";
        }
      } catch (error) {
        console.error("Error during login:", error);
        document.getElementById("error-message").innerText =
          "Network error, please try again later.";
        document.getElementById("error-message").style.display = "block";
      }
    });
  }

  // Signup form submission
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = event.target.username.value;
      const email = event.target.email.value;
      const password = event.target.password.value;
      try {
        const response = await fetch("http://localhost:5000/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password }),
        });

        const result = await response.json();
        if (response.ok) {
          document.getElementById("signup-message").innerText = result.message;
          setTimeout(() => {
            window.location.href = "login.html"; // Redirect after successful signup
          }, 2000);
        } else {
          alert(result.error); // Show error if signup fails
        }
      } catch (error) {
        console.error("Error during signup:", error);
        alert("Network error, please try again later.");
      }
    });
  }

  // Bus Search and Filtering
  if (searchForm) {
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const source = document.getElementById("source").value;
      const destination = document.getElementById("destination").value;
      const travelDate = document.getElementById("travel-date").value;

      // Simulate a search API request for buses
      // Here you would typically make an API call to your backend to get available buses.
      seatInfo.innerHTML = `
        <p>Searching buses from ${source} to ${destination} on ${travelDate}...</p>
        <p>Seats Available: 20 (Sample)</p>
        <button id="book-button" class="cta-button">Book Now</button>`;
      document
        .getElementById("book-button")
        .addEventListener("click", showBookingForm);
    });
  }

  // Booking Form
  function showBookingForm() {
    seatInfo.innerHTML = `
      <p>Booking form:</p>
      <form id="booking-form">
        <input type="text" id="passenger-name" placeholder="Enter Your Name" required />
        <input type="email" id="passenger-email" placeholder="Enter Your Email" required />
        <input type="number" id="num-tickets" placeholder="Number of Tickets" required />
        <button type="submit" class="cta-button">Confirm Booking</button>
      </form>
    `;
    document
      .getElementById("booking-form")
      .addEventListener("submit", handleBookingSubmission);
  }
  document
    .getElementById("sendConfirmationButton")
    .addEventListener("click", function () {
      // Get the necessary details (e.g., email, name, tickets)
      const email = "user@example.com"; // Retrieve the email dynamically from the user
      const name = "User Name"; // Retrieve the user name dynamically from your app
      const tickets = "1"; // Retrieve the ticket details dynamically from your app

      // Send the request to the server to send the confirmation email
      fetch("/send-confirmation-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, name, tickets }),
      })
        .then((response) => response.json())
        .then((data) => {
          console.log("Email sent successfully:", data);
          alert("Confirmation email sent successfully!");
        })
        .catch((error) => {
          console.error("Error sending confirmation email:", error);
          alert("Failed to send confirmation email.");
        });
    });

  // Function to handle booking confirmation
  async function bookNow(name, email, tickets) {
    const bookingDetails = {
      userId: localStorage.getItem("username"), // Get logged-in user ID
      name,
      email,
      tickets,
    };

    try {
      const response = await fetch("/confirmBooking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bookingDetails),
      });

      const data = await response.json();
      if (data.message === "Booking confirmed") {
        alert("Booking successful! A confirmation email has been sent.");
      } else {
        alert("Booking failed: " + data.error);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("There was an error confirming your booking.");
    }
  }

  // Handle Booking form submission
  function handleBookingSubmission(event) {
    event.preventDefault();
    const name = document.getElementById("passenger-name").value;
    const email = document.getElementById("passenger-email").value;
    const tickets = document.getElementById("num-tickets").value;

    // Call the bookNow function
    bookNow(name, email, tickets);
  }
});
