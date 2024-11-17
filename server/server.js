require("dotenv").config(); // Load environment variables
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const cors = require("cors");
const cron = require("node-cron");
const { v4: uuidv4 } = require("uuid");
const http = require("http");
const socketIo = require("socket.io");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const allowedOrigins = [
  'https://bus-reservation-roan.vercel.app/', // Replace with your actual Vercel domain
];
app.use(cors());
app.use(express.json()); // Middleware to parse JSON data
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
mongoose.set("debug", true);
app.use(cors({
  origin: allowedOrigins,
  credentials: true, // If sending cookies
}));
// MongoDB connection
mongoose
  .connect("mongodb://127.0.0.1:27017/your_database_name", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("MongoDB connected successfully.");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });
app.get("/", (req, res) => {
  res.send("Welcome to the Bus Reservation System!");
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // Access email from environment variables
    pass: process.env.EMAIL_PASS, // Access password from environment variables
  },
});

// User schema for authentication
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  email: { type: String, unique: true, required: true },
});

const User = mongoose.model("User", userSchema);
module.exports = User;

// Bus schema for search and seat availability
const busSchema = new mongoose.Schema({
  name: String,
  fromLocation: String,
  toLocation: String,
  travelDate: String,
  seats: [
    {
      number: Number,
      status: {
        type: String,
        enum: ["available", "booked"],
        default: "available",
      },
      bookedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
  ],
});

const Bus = mongoose.model("Bus", busSchema);
module.exports = Bus;

// Order schema for storing order details (without payment info)
const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Assuming there’s a "User" collection for the users
    required: true,
  },
  busId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Bus", // Assuming this is related to the buses collection
    required: true,
  },
  seatNumber: Number,
  status: {
    type: String,
    enum: ["booked", "pending"],
    default: "pending",
  },
  bookedAt: {
    type: Date,
    default: Date.now,
  },
});

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
// Book seat function
const bookSeat = async (userId, busId, seatNumber) => {
  try {
    // Insert a new order
    const newOrder = new Order({
      userId,
      busId,
      seatNumber,
      status: "booked",
    });
    await newOrder.save();

    // Update the buses collection to mark the seat as booked
    await Bus.updateOne(
      { _id: busId, "seats.number": seatNumber },
      { $set: { "seats.$.status": "booked", "seats.$.bookedBy": userId } }
    );
  } catch (err) {
    console.error("Error booking seat:", err);
  }
};

app.post("/addBus", async (req, res) => {
  const { name, fromLocation, toLocation, travelDate, seats } = req.body;

  if (!name || !fromLocation || !toLocation || !travelDate || !seats) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const newBus = new Bus({
    name,
    fromLocation,
    toLocation,
    travelDate,
    seats: seats.map((seat, index) => ({
      number: index + 1,
      status: "available", // Initial seat status
    })),
  });

  try {
    await newBus.save();
    res.status(201).json({ message: "Bus added successfully", bus: newBus });
  } catch (error) {
    res.status(500).json({ error: "Failed to add bus" });
  }
});

// Schedule a reminder email
cron.schedule("0 12 * * *", async () => {
  // Runs daily at noon
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const upcomingTrips = await Bus.find({
      travelDate: { $lte: tomorrow },
      seats: { $elemMatch: { status: "booked" } },
    }).populate("seats.bookedBy");

    upcomingTrips.forEach((trip) => {
      trip.seats.forEach((seat) => {
        if (seat.status === "booked" && seat.bookedBy) {
          const email = seat.bookedBy.email;
          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: seat.bookedBy.email,
            subject: "Trip Reminder",
            text: `Reminder: You have an upcoming trip from ${
              trip.fromLocation
            } to ${
              trip.toLocation
            } on ${trip.travelDate.toLocaleDateString()} at ${trip.travelDate.toLocaleTimeString()}.`,
          };

          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.log("Error sending reminder email:", error);
            } else {
              console.log("Reminder email sent:", info.response);
            }
          });
        }
      });
    });
  } catch (err) {
    console.error("Error in scheduled task:", err);
  }
});

// Send confirmation email after successful signup
const sendConfirmationEmail = (email, username) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Welcome to Bus Reservation System",
    text: `Hello ${username},\n\nThank you for signing up for the Bus Reservation System. Your account has been successfully created.\n\nBest Regards,\nBus Reservation Team`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log("Error sending email:", error);
    } else {
      console.log("Email sent:", info.response);
    }
  });
};

// Route to create a new user
app.post("/signup", async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password || !email) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const existingUser = await User.findOne({ $or: [{ username }, { email }] });
  if (existingUser) {
    return res.status(400).json({ error: "Username or email already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  try {
    const newUser = new User({ username, password: hashedPassword, email });
    await newUser.save();
    sendConfirmationEmail(email, username);
    res.status(201).json({
      message:
        "Account created successfully. A confirmation email has been sent.",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to create account" });
  }
});

// Route to login the user
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required" });
  }

  const user = await User.findOne({ username });

  if (user && (await bcrypt.compare(password, user.password))) {
    res.json({ message: "Login successful", username: user.username });
  } else {
    res.status(400).json({ error: "Invalid credentials" });
  }
});

// Bus search route (search buses based on fromLocation, toLocation, and travelDate)
app.get("/searchBuses", async (req, res) => {
  const { from, to, date } = req.query;
  try {
    const buses = await Bus.find({
      fromLocation: from,
      toLocation: to,
      travelDate: date,
    });
    res.json(buses);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Route to select seats
app.post("/selectSeats", async (req, res) => {
  const { busId, seatsToBook, userId } = req.body;

  if (!busId || !seatsToBook || seatsToBook.length === 0 || !userId) {
    return res.status(400).json({ error: "Invalid data" });
  }

  try {
    // Find the bus and check for seat availability
    const bus = await Bus.findById(busId);
    if (!bus) return res.status(404).json({ error: "Bus not found" });

    // Check if the selected seats are available
    const unavailableSeats = seatsToBook.filter((seatNumber) =>
      bus.seats.find(
        (seat) => seat.number === seatNumber && seat.status === "booked"
      )
    );

    if (unavailableSeats.length > 0) {
      return res.status(400).json({
        error: `Seats ${unavailableSeats.join(", ")} are already booked.`,
      });
    }

    // Book the selected seats by calling the bookSeat function
    for (const seatNumber of seatsToBook) {
      await bookSeat(userId, busId, seatNumber); // Call the function here
    }

    res
      .status(200)
      .json({ message: "Seats selected and booked successfully", bus });
  } catch (err) {
    console.error("Error in seat selection:", err);
    res.status(500).json({ error: "Error processing seat selection" });
  }
});

// Send seat booking confirmation email
// Booking route
app.post("/bookTicket", async (req, res) => {
  const { userId, busId, seatsToBook, name, email } = req.body;

  if (
    !userId ||
    !busId ||
    !seatsToBook ||
    seatsToBook.length === 0 ||
    !name ||
    !email
  ) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    // 1. Find the bus and check if the selected seats are available
    const bus = await Bus.findById(busId);
    if (!bus) {
      return res.status(404).json({ error: "Bus not found" });
    }

    // Check if selected seats are available
    const unavailableSeats = seatsToBook.filter((seatNumber) =>
      bus.seats.find(
        (seat) => seat.number === seatNumber && seat.status === "booked"
      )
    );

    if (unavailableSeats.length > 0) {
      return res.status(400).json({
        error: `Seats ${unavailableSeats.join(", ")} are already booked.`,
      });
    }

    // 2. Book the seats (update seat status in the bus and create orders)
    for (const seatNumber of seatsToBook) {
      await bookSeat(userId, busId, seatNumber); // Call the bookSeat function
    }

    // 3. Create a new ticket (order) record for the user
    const newOrder = new Order({
      userId,
      busId,
      seatNumber: seatsToBook.join(", "), // Store the seat numbers in a string
      status: "booked",
    });
    await newOrder.save();

    // 4. Send email with booking confirmation
    const mailOptions = {
      from: process.env.EMAIL_USER, // sender address
      to: email, // recipient address
      subject: "Booking Confirmation - Bus Reservation", // email subject
      text: `Dear ${name},\n\nYour booking has been confirmed!\n\nSeats Booked: ${seatsToBook.join(
        ", "
      )}\n\nThank you for choosing our bus reservation service!\n\nBest regards,\nBus Reservation Team`, // email body
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
        return res.status(500).json({
          success: false,
          error: "Failed to send confirmation email.",
        });
      }

      console.log("Email sent: " + info.response);
      res.json({
        success: true,
        message: "Booking confirmed, email sent.",
        ticket: newOrder, // Return the created ticket as part of the response
      });
    });
  } catch (error) {
    console.error("Error booking ticket:", error);
    res.status(500).json({ error: "Failed to book ticket" });
  }
});

// Route to get seats availability for a specific bus
app.get("/getSeats/:busId", async (req, res) => {
  const { busId } = req.params;
  try {
    const bus = await Bus.findById(busId);
    res.json(bus.seats); // Return seat availability
  } catch (err) {
    res.status(500).send(err);
  }
});
// Send confirmation email after successful booking
app.post("/send-confirmation-email", async (req, res) => {
  const { email, name, tickets } = req.body;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // Access email from environment variables
        pass: process.env.EMAIL_PASS, // Access password from environment variables
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Booking Confirmation",
      text: `Hello ${name},\n\nYour booking for ${tickets} ticket(s) has been confirmed.\nThank you for choosing BusService!\n\nBest regards,\nBusService Team`,
    };

    await transporter.sendMail(mailOptions);
    res.json({ status: "Email sent successfully!" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ status: "Error sending email" });
  }
});

// Route to confirm booking (without payment information)
// Route to confirm booking (without payment information)
// Route to confirm booking (without payment information)
app.post("/confirmBooking", async (req, res) => {
  try {
    const { userId, busId, seatsBooked } = req.body;

    if (!userId || !busId || !seatsBooked || seatsBooked.length === 0) {
      return res.status(400).json({ error: "Invalid booking details" });
    }

    const bus = await Bus.findById(busId);
    const user = await User.findById(userId);

    if (!bus || !user) {
      return res.status(404).json({ error: "Bus or user not found" });
    }

    // Check and mark the selected seats as booked
    bus.seats.forEach((seat) => {
      if (seatsBooked.includes(seat.number)) {
        seat.status = "booked";
        seat.bookedBy = userId; // Associate the seat with the user
      }
    });

    // Save the updated bus data with booked seats
    await bus.save();

    // Create a new order
    const order = new Order({
      userId,
      busId,
      seatsBooked,
    });

    await order.save();
    // Send booking confirmation email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Booking Confirmation - Bus Reservation",
      text: `Dear ${user.username},\n\nYour booking has been confirmed!\n\nNumber of Tickets: ${seatsBooked.length}\nThank you for choosing our bus reservation service!\n\nBest regards,\nBus Reservation Team`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
        return res
          .status(500)
          .json({ error: "Failed to send confirmation email." });
      }
      console.log("Email sent: " + info.response);
      res.status(200).json({ message: "Booking confirmed", order });
    });
  } catch (err) {
    console.error("Error confirming booking:", err);
    res.status(500).json({ error: "Failed to confirm booking" });
  }
});

// Real-time bus location tracking
const server = http.createServer(app);
const io = socketIo(server);

io.on("connection", (socket) => {
  console.log("New client connected");

  // Fake real-time location update every 5 seconds
  setInterval(() => {
    socket.emit("locationUpdate", {
      lat: Math.random() * 90, // Random latitudes
      lng: Math.random() * 180, // Random longitudes
    });
  }, 5000);

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
