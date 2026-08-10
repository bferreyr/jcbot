const fs = require('fs');
const path = 'f:/JCBot/public/script.js';

let text = fs.readFileSync(path, 'utf8');

// Replace loadProducts
const loadProductsRegex = /async function loadProducts\(\) \{[\s\S]*?\}\n(?=\nfunction toggleIgDropdown)/;

const newLoadProducts = `async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        const products = await response.json();
        
        window.allProducts = products;
        
        const container = document.getElementById('productsTableBody');
        container.innerHTML = '';
        
        if (products.length === 0) {
            container.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 20px;">No hay productos cargados.</td></tr>';
            return;
        }
        
        products.forEach(p => {
            const tr = document.createElement('tr');
            tr.className = 'product-row';
            tr.innerHTML = \`
                <td>
                    <img src="\${p.imageUrl}" alt="\${p.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">
                </td>
                <td class="product-name-cell" style="font-weight: bold; color: var(--accent);">\${p.name}</td>
                <td class="product-desc-cell" style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="\${p.description}">\${p.description}</td>
                <td>$\${p.price}</td>
                <td style="color: \${p.isPublished ? 'var(--accent)' : 'var(--text-secondary)'};">
                    <i class='bx \${p.isPublished ? 'bx-check-circle' : 'bx-time'}'></i>
                    \${p.isPublished ? 'Publicado' : 'No publicado'}
                </td>
                <td style="text-align: right; white-space: nowrap;">
                    <button class="icon-btn edit-btn" onclick="openEditProductModal('\${p.id}')" title="Editar Producto" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; padding: 5px;">
                        <i class='bx bx-pencil' style="color: var(--accent);"></i>
                    </button>
                    <div class="dropdown-wrapper" style="display: inline-block; position: relative;">
                        <button class="icon-btn ig-btn" onclick="toggleIgDropdown('\${p.id}')" title="Publicar" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; padding: 5px;">
                            <i class='bx bxl-instagram' style="color: #E1306C;"></i>
                        </button>
                        <div class="ig-dropdown" id="ig-dropdown-\${p.id}" style="right: 0; left: auto; transform: none; top: 100%; margin-top: 5px; z-index: 100;">
                            <button onclick="publishProductWrapper('\${p.id}', false)"><i class='bx bx-grid-alt'></i> Feed</button>
                            <button onclick="publishProductWrapper('\${p.id}', true)"><i class='bx bxs-camera'></i> Historia</button>
                            <button onclick="publishProductWrapper('\${p.id}', 'ambos')"><i class='bx bx-layer'></i> Ambos</button>
                        </div>
                    </div>
                    <button class="icon-btn delete-btn" onclick="deleteProduct('\${p.id}')" title="Eliminar Producto" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; padding: 5px;">
                        <i class='bx bx-trash' style="color: #ef4444;"></i>
                    </button>
                </td>
            \`;
            container.appendChild(tr);
        });
    } catch (error) {
        console.error('Error loading products:', error);
    }
}`;

text = text.replace(loadProductsRegex, newLoadProducts);

const newFunctions = `
function filterProducts() {
    const query = document.getElementById('productSearch').value.toLowerCase();
    const rows = document.querySelectorAll('.product-row');
    rows.forEach(row => {
        const name = row.querySelector('.product-name-cell').innerText.toLowerCase();
        const desc = row.querySelector('.product-desc-cell').innerText.toLowerCase();
        if (name.includes(query) || desc.includes(query)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

function openEditProductModal(id) {
    const product = window.allProducts.find(p => p.id === id);
    if (!product) return;
    
    document.getElementById('editProdId').value = product.id;
    document.getElementById('editProdName').value = product.name;
    document.getElementById('editProdDesc').value = product.description;
    document.getElementById('editProdPrice').value = product.price;
    document.getElementById('editProdImage').value = ''; // Reset file input
    
    document.getElementById('editProductModal').style.display = 'flex';
}

function closeEditProductModal() {
    document.getElementById('editProductModal').style.display = 'none';
}

async function submitEditProduct(e) {
    e.preventDefault();
    
    const id = document.getElementById('editProdId').value;
    const name = document.getElementById('editProdName').value;
    const desc = document.getElementById('editProdDesc').value;
    const price = document.getElementById('editProdPrice').value;
    const imageFile = document.getElementById('editProdImage').files[0];
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', desc);
    formData.append('price', price);
    
    if (imageFile) {
        let processedBlob;
        try {
            processedBlob = await processImageToSquare(imageFile);
            formData.append('image', processedBlob, imageFile.name.replace(/\\.[^/.]+$/, "") + ".jpg");
        } catch (err) {
            console.error("Error processing image:", err);
            alert("Error al procesar la imagen para Instagram");
            return;
        }
    }
    
    try {
        const res = await fetch('/api/products/' + id, {
            method: 'PUT',
            body: formData
        });
        
        if (res.ok) {
            closeEditProductModal();
            alert("Producto actualizado correctamente");
            loadProducts();
        } else {
            const data = await res.json();
            alert("Error: " + (data.error || "No se pudo actualizar"));
        }
    } catch (err) {
        console.error(err);
        alert("Error de red");
    }
}
`;

text = text + '\\n' + newFunctions;

fs.writeFileSync(path, text);
console.log('Script patched');
