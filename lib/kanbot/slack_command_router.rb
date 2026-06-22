require 'shellwords'

require_relative 'commands'

module Kanbot
  class SlackCommandRouter
    def initialize(commands = Commands.new)
      @commands = commands
    end

    def call(room, text)
      tokens = parse_tokens(text)
      command = tokens.shift.to_s.downcase

      case command
      when '', 'help'
        slack_help
      when 'list'
        @commands.list(room, tokens[0])
      when 'add'
        status = tokens.shift
        @commands.add(room, status, tokens)
      when 'bulkadd'
        @commands.bulkadd(room, tokens)
      when 'remove'
        status = tokens.shift
        position = tokens.shift
        @commands.remove(room, status, position)
      when 'move'
        current_status = tokens.shift
        position = tokens.shift
        new_status = tokens.shift
        @commands.move(room, current_status, position, new_status)
      else
        "Unknown command '#{command}'.\n\n#{slack_help}"
      end
    end

    private

    def parse_tokens(text)
      Shellwords.split(text.to_s)
    rescue ArgumentError
      text.to_s.split
    end

    def slack_help
      <<~HELP
        Kanbot Can!

        Use `/kanbot list [status]`, `/kanbot add [status] [item]`, `/kanbot bulkadd [item], [item]`, `/kanbot remove [status] [position]`, or `/kanbot move [current_status] [position] [new_status]`.

        Examples:
        `/kanbot list`
        `/kanbot add doing Build a Kanban Board`
        `/kanbot move doing 1 done`
      HELP
    end
  end
end
