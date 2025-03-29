'use strict';



// element toggle function
const elementToggleFunc = function (elem) { elem.classList.toggle("active"); }


// sidebar variables
const sidebar = document.querySelector("[data-sidebar]");
const sidebarBtn = document.querySelector("[data-sidebar-btn]");

// sidebar toggle functionality for mobile
sidebarBtn.addEventListener("click", function () { elementToggleFunc(sidebar); });


// custom select variables
const select = document.querySelector("[data-select]");
const selectItems = document.querySelectorAll("[data-select-item]");
const selectValue = document.querySelector("[data-selecct-value]");
const filterBtn = document.querySelectorAll("[data-filter-btn]");

select.addEventListener("click", function () { elementToggleFunc(this); });

// add event in all select items
for (let i = 0; i < selectItems.length; i++) {
  selectItems[i].addEventListener("click", function () {

    let selectedValue = this.innerText.toLowerCase();
    selectValue.innerText = this.innerText;
    elementToggleFunc(select);
    filterFunc(selectedValue);

  });
}

// filter variables
const filterItems = document.querySelectorAll("[data-filter-item]");

const filterFunc = function (selectedValue) {

  for (let i = 0; i < filterItems.length; i++) {

    if (selectedValue === "all") {
      filterItems[i].classList.add("active");
    } else if (selectedValue === filterItems[i].dataset.category) {
      filterItems[i].classList.add("active");
    } else {
      filterItems[i].classList.remove("active");
    }

  }

}

// add event in all filter button items for large screen
let lastClickedBtn = filterBtn[0];

for (let i = 0; i < filterBtn.length; i++) {

  filterBtn[i].addEventListener("click", function () {

    let selectedValue = this.innerText.toLowerCase();
    selectValue.innerText = this.innerText;
    filterFunc(selectedValue);

    lastClickedBtn.classList.remove("active");
    this.classList.add("active");
    lastClickedBtn = this;

  });

}


// page navigation variables
const navigationLinks = document.querySelectorAll("[data-nav-link]");
const pages = document.querySelectorAll("[data-page]");

// add event to all nav link
for (let i = 0; i < navigationLinks.length; i++) {
  navigationLinks[i].addEventListener("click", function () {

    for (let i = 0; i < pages.length; i++) {
      if (this.innerHTML.toLowerCase() === pages[i].dataset.page) {
        pages[i].classList.add("active");
        navigationLinks[i].classList.add("active");
        window.scrollTo(0, 0);
      } else {
        pages[i].classList.remove("active");
        navigationLinks[i].classList.remove("active");
      }
    }

  });
}

// loop animations
document.addEventListener("DOMContentLoaded", () => {
  const avatarBox = document.querySelector(".avatar-box img");
  const images = [
    "./assets/images/hello.webp", // First image
    "./assets/images/hello2.webp", // Second image
  ];

  let currentIndex = 0;

  // Function to change the image
  const changeImage = () => {
    currentIndex++;
    if (currentIndex < images.length) {
      avatarBox.src = images[currentIndex];
    } else {
      clearInterval(imageInterval); // Stop the interval after the last image
    }
  };

  // Change the image every 20 seconds
  const imageInterval = setInterval(changeImage, 7000);
});


// send email functionality
document.addEventListener("DOMContentLoaded", () => {
  const contactPage = document.querySelector("[data-page='contact']");
  const form = contactPage.querySelector(".form");
  const fullNameInput = form.querySelector("input[name='fullname']");
  const subjectInput = form.querySelector("input[name='subject']");
  const messageInput = form.querySelector("textarea[name='message']");
  const submitButton = form.querySelector(".form-btn");

  // Function to check if the contact page is active
  const isContactPageActive = () => contactPage.classList.contains("active");

  // Function to validate the form
  const checkFormValidity = () => {
    const isFullNameFilled = fullNameInput.value.trim() !== "";
    const isMessageFilled = messageInput.value.trim() !== "";

    if (isFullNameFilled && isMessageFilled) {
      submitButton.disabled = false;
    } else {
      submitButton.disabled = true;
    }
  };

  // Add event listeners only when the contact page is active
  const setupFormListeners = () => {
    [fullNameInput, subjectInput, messageInput].forEach((input) => {
      input.addEventListener("input", checkFormValidity);
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const fullName = fullNameInput.value.trim();
      const subject = subjectInput.value.trim();
      const message = messageInput.value.trim();

      // Determine the subject
      const finalSubject = subject === "" ? `Inquiry from [${fullName}]` : `${subject} [${fullName}]`;

      // Send email using mailto
      const mailtoLink = `mailto:alessandro.pegoraro.97@gmail.com?subject=${encodeURIComponent(
        finalSubject
      )}&body=${encodeURIComponent(message)}`;
      window.location.href = mailtoLink;

      // Reset the form
      form.reset();
      submitButton.disabled = true;
    });
  };

  // Observe page changes and activate the script only for the contact page
  const observer = new MutationObserver(() => {
    if (isContactPageActive()) {
      setupFormListeners();
      observer.disconnect(); // Stop observing once the listeners are set
    }
  });

  observer.observe(document.body, { attributes: true, subtree: true });
});