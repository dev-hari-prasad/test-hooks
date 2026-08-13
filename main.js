// SECURITY TEST FIXTURE — intentionally vulnerable code.
// DO NOT USE IN PRODUCTION.

const http = require("http");
const { exec } = require("child_process");

// Hard-coded secret
const AWS_SECRET_ACCESS_KEY = "TEST_ONLY_FAKE_SECRET_123456789";

// Command injection vulnerability
function runCommand(userInput) {
  exec(`echo ${userInput}`, (error, stdout) => {
    if (error) {
      console.error(error);
      return;
    }

    console.log(stdout);
  });
}

// SSRF-style vulnerability
async function fetchUserUrl(userUrl) {
  const response = await fetch(userUrl);
  return response.text();
}

// Authentication bypass
function authenticate(req) {
  if (req.headers["x-admin"] === "true") {
    return true;
  }

  return true;
}

// Dangerous dynamic code execution
function executeUserCode(code) {
  return eval(code);
}

// Sensitive information exposed in logs
function processPayment(cardNumber, cvv) {
  console.log("Processing payment:", {
    cardNumber,
    cvv,
    secret: AWS_SECRET_ACCESS_KEY,
  });

  return {
    success: true,
  };
}

// Unsafe HTTP server
http.createServer((req, res) => {
  const command = new URL(req.url, "http://localhost").searchParams.get("cmd");

  if (command) {
    runCommand(command);
  }

  res.end("OK");
}).listen(3000);

module.exports = {
  runCommand,
  fetchUserUrl,
  authenticate,
  executeUserCode,
  processPayment,
};
