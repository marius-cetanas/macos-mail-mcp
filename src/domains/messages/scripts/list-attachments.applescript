tell application "Mail"
    try
        set theMailbox to my resolveMailbox("{{accountName}}", "{{mailboxName}}")
        set msg to (first message of theMailbox whose id is {{messageId}})

        set attachJson to ""
        repeat with att in mail attachments of msg
            set attName to my escapeForJson(name of att as text)
            set rawMime to missing value
            try
                set rawMime to MIME type of att
            on error
                set rawMime to missing value
            end try
            set attMime to my escapeForJson(my attachmentMimeType(name of att as text, rawMime))
            set attSize to file size of att
            if attSize is missing value then set attSize to 0
            set attDownloaded to downloaded of att
            if attachJson is not "" then set attachJson to attachJson & ", "
            set attachJson to attachJson & "{\"name\": \"" & attName & "\", \"mimeType\": \"" & attMime & "\", \"fileSize\": " & my integerForJson(attSize) & ", \"downloaded\": " & attDownloaded & "}"
        end repeat

        return "[" & attachJson & "]"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & my integerForJson(errNum) & "}"
    end try
end tell
