# Frontend image: Vite dev server, not a production nginx build — this project's
# target here is "a judge runs one command and sees the live app," not a hardened
# production deployment. See README for the production build command if needed.
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
