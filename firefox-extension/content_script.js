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
        });
    } else {
        console.log("No move found");
        return { error: "No move found" }; // Return error to background script
    }
})();
