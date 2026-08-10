const fs = require('fs');
const path = 'f:/JCBot/public/style.css';

const text = fs.readFileSync(path, 'utf8');
const lines = text.split('\n');

const newLines = lines.slice(0, 1324);
const correctCss = `/* Product Card Styles */
.product-card {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 15px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.product-card img {
    width: 100%;
    height: 200px;
    object-fit: cover;
    border-radius: 8px;
}
.product-card h4 {
    margin: 0;
    color: var(--accent);
    font-size: 1.2rem;
}
.product-card p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.9rem;
}
.product-card .price {
    font-weight: bold;
    color: white;
    font-size: 1.1rem;
}
.product-actions {
    display: flex;
    gap: 10px;
    margin-top: auto;
}
.product-actions button {
    flex: 1;
    padding: 8px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.3s;
}
.btn-ig {
    background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
    color: white;
}
.btn-ig:hover {
    opacity: 0.9;
}
.btn-delete {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
}
.btn-delete:hover {
    background: rgba(239, 68, 68, 0.2);
}`;

newLines.push(correctCss);
if (lines.length > 1386) {
    newLines.push(...lines.slice(1386));
}

fs.writeFileSync(path, newLines.join('\n'));
console.log('Done');
