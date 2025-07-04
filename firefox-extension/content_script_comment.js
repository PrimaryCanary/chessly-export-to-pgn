(function () {
    const commentElement = document.querySelector(
        ".LessonCard_commentText__Z8d8y",
    );

    let comment = "";
    if (commentElement) {
        comment = commentElement.innerText;
    }

    const move = prompt("Enter the chess move (e.g., 'Bd7'):");

    if (move !== null && move.trim() !== "") {
        browser.runtime.sendMessage({
            action: "capture_comment_with_move",
            data: { move, comment },
        })
            .then((response) => {
                if (response && response.status === "error") {
                    console.error(
                        "Error from background script:",
                        response.message,
                    );
                }
            })
            .catch((error) => console.error("Error sending message:", error));
    } else {
        console.log("No move entered, comment not captured.");
    }
})();
