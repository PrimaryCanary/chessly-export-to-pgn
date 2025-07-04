(function () {
    const moveElement = document.querySelector(
        ".LessonCard_lastMove__rKpLq span",
    );
    const commentElement = document.querySelector(
        ".LessonCard_commentText__Z8d8y",
    );

    if (moveElement) {
        let comment = "";
        if (commentElement) {
            comment = commentElement.innerText;
        }
        const move = moveElement.innerText;

        console.log(move + "\n" + comment);
        browser.runtime.sendMessage({
            action: "capture_move",
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
        console.log("No move found");
    }
})();
