function splitMessage(text, maxLength = 1900) {
    const messages = [];
    let current = "";

    const lines = text.split("\n");

    for (const line of lines) {
        if ((current + line).length > maxLength) {
            messages.push(current);
            current = "";
        }
        current += line + "\n";
    }

    if (current.length > 0) messages.push(current);

    return messages;
}

module.exports = splitMessage;
