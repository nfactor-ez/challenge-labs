FROM nginx:latest

# Install bash so users get a proper interactive shell
RUN apt-get update && \
    apt-get install -y --no-install-recommends bash procps curl && \
    rm -rf /var/lib/apt/lists/*

# Replace the default nginx.conf with our custom one (listens on 8888)
COPY nginx.conf /etc/nginx/nginx.conf

# Create a simple index page
RUN echo '<html><body><h1>Welcome to the ChallengeLabs Nginx instance.</h1></body></html>' \
    > /usr/share/nginx/html/index.html

# Add a hint file visible in the filesystem
RUN echo "Hint: Check the Nginx configuration file to find the listening port." \
    > /root/README.txt && \
    echo "The flag is accessible at http://localhost:<PORT>/flag once you find the right port." \
    >> /root/README.txt

# Keep nginx running in the foreground (standard Docker pattern).
# The platform will exec a shell (/bin/sh) into this running container
# so users can interact with it via the terminal.
CMD ["nginx", "-g", "daemon off;"]

