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
selectItems.forEach((item) => {
  item.addEventListener("click", function () {

    let selectedValue = this.innerText.toLowerCase();
    selectValue.innerText = this.innerText;
    elementToggleFunc(select);
    filterFunc(selectedValue);

  });
});

// filter variables
const filterItems = document.querySelectorAll("[data-filter-item]");

const filterFunc = function (selectedValue) {

  filterItems.forEach((item) => {

    if (selectedValue === "all" || selectedValue === item.dataset.category) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }

  });

}

// add event in all filter button items for large screen
let lastClickedBtn = filterBtn[0];

filterBtn.forEach((btn) => {

  btn.addEventListener("click", function () {

    let selectedValue = this.innerText.toLowerCase();
    selectValue.innerText = this.innerText;
    filterFunc(selectedValue);

    lastClickedBtn.classList.remove("active");
    this.classList.add("active");
    lastClickedBtn = this;

  });

});


// page navigation variables
const navigationLinks = document.querySelectorAll("[data-nav-link]");
const pages = document.querySelectorAll("[data-page]");

// add event to all nav link
navigationLinks.forEach((link) => {
  link.addEventListener("click", function () {

    const targetPage = this.innerHTML.toLowerCase();

    pages.forEach((page) => {
      page.classList.toggle("active", page.dataset.page === targetPage);
    });

    navigationLinks.forEach((navLink) => {
      navLink.classList.toggle("active", navLink === this);
    });

    window.scrollTo(0, 0);

  });
});

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

  // Function to validate the form
  const checkFormValidity = () => {
    const isFullNameFilled = fullNameInput.value.trim() !== "";
    const isMessageFilled = messageInput.value.trim() !== "";
    submitButton.disabled = !(isFullNameFilled && isMessageFilled);
  };

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
});