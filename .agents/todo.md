# Todo

Kallo Framework issues:
1. [x] Make sure the frameworks reads the favicon.ico in the public dir by default if no favicon.ico is provided we use that as the default fallback.
2. [x] The cli generates a tailwind config which isn't the new way to do things in the new tailwind, browse the web to find out how to setup the new tailwind (css first approach). Update the cli to generate this new setup. The current tailwid setup isn't working, the server is running on port 3000 right now and it's not looking styled at all.
3. [x] The cli should also generate manifest json, llm.tsx, robot.tsx and every other thing that should be in the public dir by default for a modern web app or web site. (Updated to use robots.txt and llm.txt as requested).
