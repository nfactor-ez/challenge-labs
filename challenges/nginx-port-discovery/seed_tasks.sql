DELETE FROM tasks WHERE challenge_id = 1;

INSERT INTO tasks (challenge_id, "order", title, description, is_required) VALUES
(1, 1, 'Inspect the Nginx config',
 'Run the following command to view the Nginx configuration file:

  cat /etc/nginx/nginx.conf

Look for the listen directive inside the server block.',
 true),

(1, 2, 'Identify the listening port',
 'What port number appears after the listen keyword? That is the port Nginx is configured on.',
 true),

(1, 3, 'Retrieve the flag',
 'Now use curl to query the /flag endpoint on the discovered port:

  curl http://localhost:<PORT>/flag

Replace <PORT> with the port number you found. Submit the flag you receive.',
 true);
