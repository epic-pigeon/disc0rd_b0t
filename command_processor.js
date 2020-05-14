function Token(type, value) {
    this.type = type;
    this.value = value;
    if (this.type === "VALUE_STRING") {
        this.value = this.value.slice(1, -1);
    } else if (this.type === "VALUE_NUMBER") {
        this.value = parseFloat(this.value);
    } else if (this.type === "VALUE_BOOLEAN") {
        this.value = this.value === 'true';
    }
}

function CommandProcessor(commands) {
    let self = this;
    this.commands = commands;
    this.process = function (command, msg) {
        let rules = [
            {type: "VALUE_NUMBER", regexp: "(\\d+)(\\.\\d+)?"},
            {type: "VALUE_STRING", regexp: "((\"(?:[^\"\\\\]|\\\\.)*\")|('(?:[^'\\\\]|\\\\.)*'))"},
            {type: "VALUE_BOOLEAN", regexp: "(true|false)"}
        ];
        let commandNames = [];
        this.commands.forEach(command => {commandNames.push(command.name)});
        let sortByLength = (a, b) => b.length - a.length;
        commandNames = commandNames.sort(sortByLength);
        rules.push({type: "COMMAND", regexp: "(" + commandNames.join("|") + ")"});
        let toSkip = "([ \\n\\t\\r]+)";
        let tokens = this.lexer(command, rules, toSkip);
        if (tokens[0].type === "COMMAND") {
            let commandToken = tokens[0];
            let commandObject;
            this.commands.forEach(comm => {
                if (comm.name === commandToken.value.toLowerCase()) commandObject = comm;
            });
            if (typeof commandObject === "undefined") throw {message: "wtf"};
            if (!commandObject.adminOnly) {
                tokens.shift();
                commandObject.action(msg, tokens, self);
            } else {
                if (msg.member.roles.cache.has(msg.guild.roles.cache.find(role => role.name === "розбійники").id || msg.member.user.tag === "интимная петарда#8221")) {
                    tokens.shift();
                    commandObject.action(msg, tokens, self);
                } else throw {message: "Not enough rights!"}
            }
        } else {
            throw {message: "Unrecognized command"};
        }
    };
    this.lexer = function (command, rules, toSkip) {
        let tokens = [];
        toSkip = new RegExp('^' + toSkip, 'i');
        this.position = 0;
        this.buffer = command;
        let skip = () => {
            let result = this.buffer.substring(this.position).match(toSkip);
            if (result) {
                this.position += result[0].length;
            }
        };
        while (this.position < this.buffer.length) {
            skip();
            let finalResult = false, finalRule = false;
            for (let i = 0; i < rules.length; i++) {
                let rule = rules[i];
                let result = new RegExp('^' + rule.regexp).exec(this.buffer.substring(this.position));
                //console.log(new RegExp('^' + rule.regexp), result, this.buffer.substring(this.position));
                if (result) {
                    finalResult = result;
                    finalRule = rule;
                    break;
                }
            }
            if (finalResult) {
                //console.log(finalResult[0], finalRule.type);
                this.position += finalResult[0].length;
                tokens.push(new Token(finalRule.type, finalResult[0]));
            } else {
                throw {message: "Unrecognized token"};
            }
        }
        return tokens;
    }
}

module.exports = CommandProcessor;