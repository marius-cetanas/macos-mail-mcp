-- Read body from temp file to preserve newlines
set bodyContent to do shell script "cat " & quoted form of "{{bodyFile}}"
set subjectText to "{{subject}}"

tell application "Mail"
    try
        set newMsg to make new outgoing message with properties {content:bodyContent, subject:subjectText, visible:false}
        tell newMsg
            make new to recipient with properties {address:"{{to}}"}
            if "{{cc}}" is not "__NONE__" then
                make new cc recipient with properties {address:"{{cc}}"}
            end if
            if "{{bcc}}" is not "__NONE__" then
                make new bcc recipient with properties {address:"{{bcc}}"}
            end if
            if "{{attachmentPathsFile}}" is not "__NONE__" then
                set attachmentData to do shell script "cat " & quoted form of "{{attachmentPathsFile}}"
                set AppleScript's text item delimiters to (ASCII character 10)
                set pathList to every text item of attachmentData
                set AppleScript's text item delimiters to ""
                repeat with attachPath in pathList
                    make new attachment with properties {file name:POSIX file (attachPath as text)} at after last paragraph
                    delay 1
                end repeat
            end if
            send
        end tell
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
