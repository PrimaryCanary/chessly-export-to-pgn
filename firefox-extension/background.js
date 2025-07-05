browser.commands.onCommand.addListener(function (command) {
    if (command === "capture-move") {
        browser.tabs.query(
            { active: true, currentWindow: true },
            function (tabs) {
                browser.tabs.executeScript(
                    tabs[0].id,
                    { file: "content_script.js" },
                );
            },
        );
    } else if (command === "export-pgn") {
        fetch("http://localhost:5000/export_pgn", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
        })
            .then((response) => {
                if (!response.ok) {
                    return response.json().then((errorData) => {
                        throw new Error(errorData.message || "Unknown error");
                    });
                }
                return response.json();
            })
            .catch((err) => console.error("Error in export-pgn:", err));
    } else if (command === "capture-comment") {
        browser.tabs.query(
            { active: true, currentWindow: true },
            function (tabs) {
                browser.tabs.executeScript(
                    tabs[0].id,
                    { file: "content_script_comment.js" }, // New content script for comment capture
                );
            },
        );
    }
});

browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === "capture_move") {
        fetch("http://localhost:5000/capture_move", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(request.data),
        })
            .then((response) => {
                if (!response.ok) {
                    return response.json().then((errorData) => {
                        throw new Error(errorData.message || "Unknown error");
                    });
                }
                return response.json();
            })
            .catch((err) => console.error("Error in capture_move:", err));
    } else if (request.action === "capture_comment_with_move") { // New action for comment with move
        fetch("http://localhost:5000/capture_move", { // Still sends to capture_move endpoint
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(request.data),
        })
            .then((response) => {
                if (!response.ok) {
                    return response.json().then((errorData) => {
                        throw new Error(errorData.message || "Unknown error");
                    });
                }
                return response.json();
            })
            .catch((err) =>
                console.error("Error in capture_comment_with_move:", err)
            );
    }
});
