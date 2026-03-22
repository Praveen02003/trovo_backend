import express from "express";
import mysql from "mysql2";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";


const app = express();

app.use(express.json()); // important
app.use(cors());

process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
    console.error("Unhandled Rejection:", err);
});

const db = mysql.createPool({
    host: "127.0.0.1",
    user: "root",
    password: "root",
    database: "trovo",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000
});

// Log connection once
db.getConnection((err, connection) => {
    if (err) {
        console.error("DB Connection Failed:", err);
        return;
    }
    console.log("MySQL Connected");
    connection.release();
});

// Handle pool errors
db.on("error", (err) => {
    console.error("MySQL Pool Error:", err);
});

var secretkey = '1234567890';

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "images/");
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });
app.use("/images", express.static("images"));



const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.send({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, secretkey, (err, decoded) => {
        if (err) {
            return res.send({ message: "Invalid token" });
        }
        console.log(decoded, "====>");

        req.user = decoded; // ✅ id & email
        next();
    });
};


app.get("/", (req, res) => {
    res.send("Server Running");
});

app.post("/createuser", async (req, res) => {

    const { data } = req.body;

    // console.log(data);
    const getdata = "SELECT * from users where email = ?"
    db.query(getdata, [data.mail], async (err, result) => {
        if (err) {
            return res.send({
                message: "database error"
            })
        }
        else {
            const hashedPassword = await bcrypt.hash(data.password, 10);

            if (result.length > 0) {
                return res.send({
                    message: "email already exists"
                })
            }
            else {
                const sql = "INSERT INTO users (name, email, password, mobilenumber , address ,profileimage ) VALUES (?,?,?,?,?,?)";
                db.query(sql, [data.name, data.mail, hashedPassword, data.mobile, data.address, null], async (err, result) => {
                    if (err) {
                        return res.send({
                            "message": "Error inserting user"
                        });
                    } else {
                        return res.send({
                            message: "User created successfully"
                        });
                    }
                }
                );
            }
        }
    })
});

app.post("/verifyuser", async (req, res) => {

    const { data } = req.body;

    // console.log(data);
    const getdata = "SELECT * from users where email = ?"
    db.query(getdata, [data.mail], async (err, result) => {
        if (err) {
            return res.send({
                message: "database error"
            })
        }
        else {
            if (result.length > 0) {
                var password = result[0]['password'];
                var finalresult = await bcrypt.compare(data.password, password);
                if (finalresult) {
                    var id = result[0]['id'];
                    var mail = result[0]['email'];
                    const token = jwt.sign(
                        { id: id, email: mail },
                        secretkey,
                        { expiresIn: "1d" }
                    );
                    console.log(token);

                    return res.send({
                        token: token,
                        data: result[0],
                        message: "Login Successfull"
                    })
                }
                else {
                    return res.send({
                        message: "Invalid Password"
                    })
                }
            }
            else {
                return res.send({
                    message: "Invalid Credentials"
                })
            }
        }
    })
});

app.post("/updatepassword", async (req, res) => {
    const { data } = req.body;

    const getdata = "SELECT * FROM users WHERE email = ?";

    db.query(getdata, [data.mail], async (err, result) => {
        if (err) {
            return res.send({ message: "Database error" });
        }

        if (result.length === 0) {
            return res.send({ message: "Invalid Credentials" });
        }

        try {
            const hashedPassword = await bcrypt.hash(data.password, 10);
            const updatequery = "UPDATE users SET password = ? WHERE email = ?";

            db.query(updatequery, [hashedPassword, data.mail], (err, updateresult) => {
                if (err) {
                    return res.send({ message: "Error updating password" });
                }

                return res.send({ message: "Password updated successfully" });
            });
        } catch (hashError) {
            return res.send({ message: "Error hashing password" });
        }
    });
});




// Admin routes

app.get("/getallproducts", (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const category = req.query.category || "all";
    const search = req.query.search || "";
    const offset = (page - 1) * limit;

    const searchVal = `%${search}%`;

    // 1. Start with the base query
    let sql = `
        SELECT products.*, brands.brand_name, categories.category_name 
        FROM products
        INNER JOIN brands ON products.brand_id = brands.brand_id
        INNER JOIN categories ON products.category_id = categories.category_id
        WHERE (products.product_name LIKE ? OR products.product_id LIKE ?)
    `;

    let queryParams = [searchVal, searchVal];

    // 2. Add Category Filter only if it's not "all"
    if (category !== "all" && category !== "Select Category") {
        sql += ` AND products.category_id = ?`;
        queryParams.push(category);
    }

    // 3. Add Pagination
    sql += ` LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    db.query(sql, queryParams, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ message: "Database error" });
        }

        if (result.length === 0) {
            return res.send({ message: "No Products Available", data: [] });
        }

        res.send({
            message: "Success",
            data: result
        });
    });
});


app.get("/getallcategories", (req, res) => {
    // 1. Extract params
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    // 2. Query with search and pagination
    const getdata = `
        SELECT * FROM categories 
        WHERE category_name LIKE ? 
        ORDER BY category_id DESC 
        LIMIT ? OFFSET ?
    `;

    const searchVal = `%${search}%`;

    db.query(getdata, [searchVal, limit, offset], (err, result) => {
        if (err) {
            return res.send({ message: "Database error" });
        }

        if (result.length === 0) {
            return res.send({ message: "No Categories Available", data: [] });
        }

        return res.send({
            message: "Success",
            data: result
        });
    });
});


app.get("/getallbrands", async (req, res) => {
    // 1. Get params from request
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    // 2. SQL query with Search and Pagination
    const getdata = `
        SELECT * FROM brands 
        WHERE brand_name LIKE ? 
        ORDER BY brand_id DESC 
        LIMIT ? OFFSET ?
    `;

    const searchVal = `%${search}%`;

    db.query(getdata, [searchVal, limit, offset], (err, result) => {
        if (err) {
            return res.status(500).send({ message: "Database error" });
        }

        if (result.length === 0) {
            // Send empty data array instead of error so frontend map doesn't crash
            return res.send({ message: "No Brands Available", data: [] });
        }

        return res.send({
            message: "Success",
            data: result
        });
    });
});


app.get("/deleteproduct/:id", async (req, res) => {
    const id = req.params.id

    const getdata = `
    DELETE FROM products WHERE product_id = ?`;

    db.query(getdata, [id], async (err, result) => {
        if (err) {
            return res.send({ message: "Database error" });
        }
        return res.send({ message: "Product Deleted Successfully" });
    });
});

app.get("/getcurrentproduct/:id", async (req, res) => {
    const id = req.params.id
    console.log(id);

    const getdata = `
    SELECT * FROM products 
    INNER JOIN brands ON products.brand_id = brands.brand_id
    INNER JOIN categories ON products.category_id = categories.category_id 
    WHERE product_id = ?`;

    db.query(getdata, [id], async (err, result) => {
        if (err) {
            return res.send({ message: "Database error" });
        }

        if (result.length === 0) {
            return res.send({ message: "No Product Found" });
        }

        try {
            // console.log(result[0]);
            return res.send({
                message: "Success",
                data: result[0]
            });

        } catch (hashError) {
            return res.send({ message: "Error Fetching Product" });
        }
    });
});


app.post("/createproduct", upload.single("image"), (req, res) => {

    const {
        name,
        description,
        original_price,
        price,
        offer,
        stock,
        category_id,
        brand_id,
        status
    } = req.body;

    const image = req.file.filename;

    const sql = `
        INSERT INTO products
        (product_name, description, original_price, price, offer, stock, image, category_id, brand_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

    db.query(
        sql,
        [
            name,
            description,
            original_price,
            price,
            offer,
            stock,
            image,
            category_id,
            brand_id,
            status
        ],
        (err, result) => {

            if (err) {
                return res.json({ message: "Product Name Already Exists" });
            }

            res.json({ message: "Product Created Successfully" });

        }
    );
});

app.post("/updateproduct", upload.single("newimage"), (req, res) => {
    const {
        product_id,
        name,
        description,
        original_price,
        price,
        offer,
        stock,
        category_id,
        brand_id,
        status,
        image
    } = req.body;

    // FIX: If req.file is present, use the NEW filename. 
    // Otherwise, keep the EXISTING 'image' filename sent from req.body.
    const finalImage = req.file ? req.file.filename : image;

    // Debugging: This will tell you if a file actually reached the server
    console.log("File received:", req.file);
    console.log("Final Image Path:", finalImage);

    const sql = `UPDATE products SET product_name=?, description=?, original_price=?, price=?, offer=?, stock=?, image=?, category_id=?, brand_id=?, status=? WHERE product_id=?`;

    db.query(sql, [name, description, original_price, price, offer, stock, finalImage, category_id, brand_id, status, product_id], (err, result) => {
        if (err) {
            console.error("SQL Error:", err);
            return res.json({ message: "Error updating product" });
        }
        if (result.affectedRows === 0) return res.json({ message: "Product not found" });
        res.json({ message: "Product Updated Successfully" });
    });
});

app.get("/getallcustomers", (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const status = req.query.status || "all";
    const search = req.query.search || "";
    const offset = (page - 1) * limit;

    const searchVal = `%${search}%`;

    let sql = "SELECT * FROM users WHERE (name LIKE ? OR email LIKE ?) AND (role != 'admin')";
    let countSql = "SELECT COUNT(*) as total FROM users WHERE (name LIKE ? OR email LIKE ?)";
    const params = [searchVal, searchVal];

    if (status !== "all") {
        sql += " AND status = ?";
        countSql += " AND status = ?";
        params.push(status);
    }

    // First, get total count
    db.query(countSql, params, (err, countResult) => {
        if (err) return res.status(500).json({ message: "Database Error" });

        const totalPages = Math.ceil(countResult[0].total / limit);

        // Get paginated data
        db.query(sql + " LIMIT ? OFFSET ?", [...params, limit, offset], (err, data) => {
            if (err) return res.status(500).json({ message: "Database Error" });

            res.json({
                message: "Success",
                data,
                totalPages,
                currentPage: page
            });
        });
    });
});

app.get("/vieweachcustomer/:id", (req, res) => {
    const id = req.params.id
    console.log(id);

    const getdata = `
    SELECT * FROM users 
    WHERE user_id = ?`;

    db.query(getdata, [id], async (err, result) => {
        if (err) {
            return res.send({ message: "Database error" });
        }

        if (result.length === 0) {
            return res.send({ message: "No User Found" });
        }

        try {
            // console.log(result[0]);
            return res.send({
                message: "Success",
                data: result[0]
            });

        } catch (hashError) {
            return res.send({ message: "Error Fetching Customer" });
        }
    });
});

app.get("/blockcustomer/:id", async (req, res) => {
    const id = req.params.id;

    const getdetails = 'SELECT * FROM users WHERE user_id = ?';
    db.query(getdetails, [id], async (err, result) => {
        if (err) {
            console.log(err);

            return res.send({ message: "Database error" });
        }
        if (result[0].status === 'active') {
            const updatedata = `
                UPDATE users SET status = ? WHERE user_id = ?`;

            db.query(updatedata, ['blocked', id], async (err, result) => {
                if (err) {
                    console.log(err);
                    return res.send({ message: "Database error" });
                }
                return res.send({ message: "User Blocked Successfully" });
            });
        }
        else {
            const updatedata = `
                UPDATE users SET status = ? WHERE user_id = ?`;

            db.query(updatedata, ['active', id], async (err, result) => {
                if (err) {
                    console.log(err);
                    return res.send({ message: "Database error" });
                }
                return res.send({ message: "User UnBlocked Successfully" });
            });
        }

    });
});


app.get("/getuserprofile/:id", async (req, res) => {
    const id = req.params.id

    const getdata = `
    SELECT * FROM users WHERE user_id = ?`;

    db.query(getdata, [id], async (err, result) => {
        if (err) {
            return res.send({ message: "Database error" });
        }

        if (result.length === 0) {
            return res.send({ message: "No User Found" });
        }

        try {
            return res.send({
                message: "Success",
                data: result[0]
            });

        } catch (hashError) {
            return res.send({ message: "Error Fetching User" });
        }
    });
});

app.post("/updateprofile", upload.single("image"), (req, res) => {

    const { user_id, name, email, mobilenumber, address } = req.body;


    let image = req.file ? req.file.filename : null;

    if (image) {

        const sql = `
        UPDATE users 
        SET name=?, email=?, mobilenumber=?, address=?, profileimage=? 
        WHERE user_id=?`;

        db.query(sql,
            [name, email, mobilenumber, address, image, user_id],
            (err, result) => {

                if (err) return res.send(err);

                res.send({ message: "Profile Updated With Image" });
            });

    } else {

        const sql = `
        UPDATE users 
        SET name=?, email=?, mobilenumber=?, address=? 
        WHERE user_id=?`;

        db.query(sql,
            [name, email, mobilenumber, address, user_id],
            (err, result) => {

                if (err) return res.send(err);

                res.send({ message: "Profile Updated" });
            });

    }

});

app.post('/addbrand', (req, res) => {
    const { brand_name } = req.body;

    if (!brand_name) {
        return res.json({ message: "Brand name is required" });
    }

    const sql = "INSERT INTO brands (brand_name) VALUES (?)";
    db.query(sql, [brand_name], (err, result) => {
        if (err) {
            // console.error(err);
            if (err.code === 'ER_DUP_ENTRY') {
                return res.json({ message: "Brand already exists" });
            }
            return res.status(500).json({ message: "Database error" });
        }
        res.json({
            message: "Brand created",
            brandId: result.insertId
        });
    });
});


app.post('/addcategory', upload.single('category_image'), (req, res) => {
    const { category_name } = req.body;
    const category_image = req.file ? req.file.filename : null;
    console.log(category_image);
    console.log(category_name);


    if (!category_name || !category_image) {
        return res.json({ message: "All fields are required" });
    }

    const sql = "INSERT INTO categories (category_name, category_image) VALUES (?, ?)";
    db.query(sql, [category_name, category_image], (err, result) => {
        if (err) {
            return res.json({ message: "Category Already Exists" });
        }
        res.json({ message: "Category Created" });
    });
});


app.delete("/deletebrand/:id", (req, res) => {
    const { id } = req.params;

    // Check if brand is linked to products first (Optional but safe)
    const checkSql = "SELECT * FROM products WHERE brand_id = ?";
    db.query(checkSql, [id], (err, results) => {
        if (results.length > 0) {
            return res.json({
                message: "Cannot delete! Brand is currently linked to products."
            });
        }

        // If not linked, proceed with deletion
        const sql = "DELETE FROM brands WHERE brand_id = ?";
        db.query(sql, [id], (err, result) => {
            if (err) {
                return res.json({ message: "Database error" });
            }
            res.json({ message: "Brand Deleted Successfully" });
        });
    });
});

app.post("/updatebrand", (req, res) => {
    const { brand_name, brand_id } = req.body;

    if (!brand_name || !brand_id) {
        return res.send({ message: "Brand name and ID are required" });
    }

    const sql = "UPDATE brands SET brand_name = ? WHERE brand_id = ?";

    db.query(sql, [brand_name, brand_id], (err, result) => {
        if (err) {
            console.error(err);
            return res.send({ message: "Database error" });
        }

        if (result.affectedRows === 0) {
            return res.send({ message: "Brand not found" });
        }

        res.send({ message: "Brand Updated Successfully" });
    });
});

app.delete("/deletecategory/:id", (req, res) => {
    const { id } = req.params;

    // Optional: Check if category has products before deleting
    const checkSql = "SELECT * FROM products WHERE category_id = ?";
    db.query(checkSql, [id], (err, results) => {
        if (results.length > 0) {
            return res.json({ message: "Category is in use by products!" });
        }

        const sql = "DELETE FROM categories WHERE category_id = ?";
        db.query(sql, [id], (err, result) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Category Deleted Successfully" });
        });
    });
});

app.post('/updatecategory', upload.single('category_image'), (req, res) => {
    const { category_id, category_name } = req.body;
    const new_image = req.file ? req.file.filename : null;

    if (new_image) {
        // Update both name and image
        const sql = "UPDATE categories SET category_name = ?, category_image = ? WHERE category_id = ?";
        db.query(sql, [category_name, new_image, category_id], (err, result) => {
            if (err) return res.json({ message: "Update Error" });
            res.json({ message: "Category Updated" });
        });
    } else {
        // Update only name
        const sql = "UPDATE categories SET category_name = ? WHERE category_id = ?";
        db.query(sql, [category_name, category_id], (err, result) => {
            if (err) return res.json({ message: "Update Error" });
            res.json({ message: "Category Updated" });
        });
    }
});

app.get("/getadmindashboarddata", (req, res) => {
    // Query 1: All Dashboard Stats
    const statsSql = `
    SELECT 
        (SELECT COUNT(*) FROM users) as customers,
        (SELECT COUNT(*) FROM products) as products,
        (SELECT COUNT(*) FROM users WHERE status = 'active') as activeCustomers,
        (SELECT COUNT(*) FROM users WHERE status = 'blocked') as blockedCustomers,
        (SELECT COUNT(*) FROM products WHERE status = 'active') as active,
        (SELECT COUNT(*) FROM products WHERE status = 'inactive') as inactive,
        (SELECT COUNT(*) FROM brands) as brands,
        (SELECT COUNT(*) FROM categories) as categories,
        (SELECT COUNT(*) FROM orders) as orders,
        (SELECT IFNULL(SUM(total_amount), 0) FROM orders) as totalRevenue,
        (SELECT IFNULL(SUM(total_amount)/NULLIF(COUNT(*),0),0) FROM orders) as avgSale
`;

    // Query 2: Last 5 Transactions
    const transactionsSql = `
        SELECT * 
        FROM orders
        JOIN users ON orders.user_id = users.user_id
        ORDER BY orders.created_at DESC 
        LIMIT 5
    `;


    db.query(statsSql, (err, statsResult) => {
        if (err) return res.status(500).json({ success: false, message: "Stats Error" });

        db.query(transactionsSql, (err, transResult) => {
            if (err) return res.status(500).json({ success: false, message: "Transaction Error" });
            res.json({
                success: true,
                data: statsResult[0],
                recentTransactions: transResult
            });
        });
    });
});



app.get("/fewproducts", (req, res) => {
    db.query("SELECT * FROM products ORDER BY product_id DESC LIMIT 4", (err, result) => {
        if (err) return res.status(500).json({ message: "DB error" });
        res.json({ data: result });
    });
});


app.get('/getparticularproduct/:id', (req, res) => {
    const productId = req.params.id; // Extract ID from the URL
    const sql = `SELECT * FROM products 
    INNER JOIN categories on categories.category_id = products.category_id  
    INNER JOIN brands on brands.brand_id = products.brand_id 
    WHERE product_id = ?`;

    db.query(sql, [productId], (err, result) => {
        if (err) {
            return res.json({ message: err.message });
        }

        // Check if product exists
        if (result.length === 0) {
            return res.json({ message: "Product not found" });
        }

        // Return only the single object instead of an array
        res.json({ data: result[0] });
    });
});


app.post("/addtowishlist", (req, res) => {
    const { userid, productid } = req.body;

    if (!userid || !productid) {
        return res.status(400).json({ message: "Invalid data" });
    }

    db.query(
        "INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)",
        [userid, productid],
        (err) => {
            if (err) {
                console.error(err);

                if (err.code === "ER_DUP_ENTRY") {
                    return res.json({ message: "Already in wishlist" });
                }

                return res.status(500).json({ message: "Database error" });
            }

            res.json({ message: "Added to wishlist" });
        }
    );
});

app.post("/removefromwishlist", (req, res) => {
    const { userid, productid } = req.body;

    if (!userid || !productid) {
        return res.status(400).json({ message: "Invalid data" });
    }

    db.query(
        "DELETE FROM wishlist WHERE user_id = ? AND product_id = ?",
        [userid, productid],
        (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ message: "Database error" });
            }

            res.json({ message: "Removed from wishlist" });
        }
    );
});

app.get("/getwishlistdata/:id", (req, res) => {
    const id = req.params.id;
    const sql = `SELECT * FROM wishlist 
    INNER JOIN users ON users.user_id = wishlist.user_id
    INNER JOIN products ON products.product_id = wishlist.product_id 
    INNER JOIN categories ON categories.category_id = products.category_id 
    INNER JOIN brands ON brands.brand_id = products.brand_id 
    WHERE wishlist.user_id = ? `

    db.query(
        sql,
        [id],
        (err, result) => {
            if (err) return res.status(500).json({ message: "DB error" });

            res.json({ data: result });
        }
    );
});

app.get('/getallactiveproducts', (req, res) => {
    const { category, search } = req.query;

    let sql = `SELECT * FROM products 
               INNER JOIN categories ON categories.category_id = products.category_id  
               INNER JOIN brands ON brands.brand_id = products.brand_id 
               WHERE products.status = 'active'`;

    let queryParams = [];

    // Category Filter
    if (category && category !== "All") {
        sql += ` AND categories.category_name = ?`;
        queryParams.push(category);
    }

    // Search Filter
    if (search) {
        sql += ` AND (products.product_name LIKE ? OR brands.brand_name LIKE ?)`;
        const searchTerm = `%${search}%`;
        queryParams.push(searchTerm, searchTerm);
    }

    db.query(sql, queryParams, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: results });
    });
});

app.get("/getcategories", (req, res) => {
    const getdata = `SELECT * FROM categories `;


    db.query(getdata, (err, result) => {
        if (err) {
            return res.send({ message: "Database error" });
        }

        if (result.length === 0) {
            return res.send({ message: "No Categories Available", data: [] });
        }

        return res.send({
            message: "Success",
            data: result
        });
    });
});

app.post("/addtocart", (req, res) => {
    const { userid, productid, quantity } = req.body;

    if (!userid || !productid) {
        return res.status(400).json({ message: "Invalid data" });
    }

    const qty = quantity || 1;

    // ✅ CHECK IF PRODUCT ALREADY EXISTS
    const checkSql = "SELECT * FROM cart WHERE user_id = ? AND product_id = ?";

    db.query(checkSql, [userid, productid], (err, result) => {
        if (err) return res.status(500).json({ message: "DB error" });

        if (result.length > 0) {
            // ✅ UPDATE QUANTITY
            const updateSql = `
                UPDATE cart 
                SET quantity = quantity + ? 
                WHERE user_id = ? AND product_id = ?
            `;

            db.query(updateSql, [qty, userid, productid], (err) => {
                if (err) return res.status(500).json({ message: "Update error" });

                return res.json({ message: "Quantity updated" });
            });

        } else {
            // ✅ INSERT NEW ITEM
            const insertSql = `
                INSERT INTO cart (user_id, product_id, quantity) 
                VALUES (?, ?, ?)
            `;

            db.query(insertSql, [userid, productid, qty], (err) => {
                if (err) return res.status(500).json({ message: "Insert error" });

                return res.json({ message: "Added to cart" });
            });
        }
    });
});

app.post("/removefromcart", (req, res) => {
    const { userid, productid } = req.body;

    if (!userid || !productid) {
        return res.status(400).json({ message: "Invalid data" });
    }

    const sql = "DELETE FROM cart WHERE user_id = ? AND product_id = ?";

    db.query(
        sql,
        [userid, productid],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ message: "Database error" });
            }

            // Optional: Check if anything was actually deleted
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "Item not found in cart" });
            }

            res.json({ message: "Removed from cart" });
        }
    );
});


app.get("/getcartdata/:id", (req, res) => {
    const id = req.params.id;
    // Joining cart with users, products, categories, and brands to get full details
    const sql = `SELECT * FROM cart 
    INNER JOIN users ON users.user_id = cart.user_id
    INNER JOIN products ON products.product_id = cart.product_id 
    INNER JOIN categories ON categories.category_id = products.category_id 
    INNER JOIN brands ON brands.brand_id = products.brand_id 
    WHERE cart.user_id = ?`;

    db.query(
        sql,
        [id],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ message: "DB error" });
            }

            // Returns data as res.data.data for your frontend logic
            res.json({ data: result });
        }
    );
});

app.post('/updatecartquantity', (req, res) => {
    const { userid, productid, quantity } = req.body;

    const sql = `
        UPDATE cart 
        SET quantity = ? 
        WHERE user_id = ? AND product_id = ?
    `;

    db.query(sql, [quantity, userid, productid], (err, result) => {
        if (err) {
            return res.status(500).json({ message: "Error updating quantity" });
        }

        return res.json({ message: "Quantity updated" });
    });
});


app.post("/createorder", (req, res) => {

    const { user_id } = req.body;

    // 1️⃣ Get cart items
    const cartSql = `
        SELECT c.product_id, c.quantity, p.price
        FROM cart c
        JOIN products p ON c.product_id = p.product_id
        WHERE c.user_id = ?
    `;

    db.query(cartSql, [user_id], (err, cartItems) => {

        if (err) return res.status(500).json({ message: "DB error" });

        if (cartItems.length === 0) {
            return res.json({ message: "Cart empty" });
        }

        // 2️⃣ CALCULATE VALUES
        let subtotal = 0;

        cartItems.forEach(item => {
            subtotal += item.price * item.quantity;
        });

        const tax = subtotal * 0.03; // 3%
        const total = subtotal + tax;

        // 3️⃣ INSERT ORDER
        const orderSql = `
            INSERT INTO orders (user_id, subtotal, tax, total_amount, order_status)
            VALUES (?, ?, ?, ?, 'Placed')
        `;

        db.query(orderSql, [user_id, subtotal, tax, total], (err, result) => {

            if (err) return res.status(500).json({ message: "Order error" });

            const orderId = result.insertId;

            // 4️⃣ INSERT ORDER ITEMS
            const itemsSql = `
                INSERT INTO order_items (order_id, user_id, product_id, quantity, price)
                VALUES ?
            `;

            const values = cartItems.map(item => [
                orderId,
                user_id,
                item.product_id,
                item.quantity,
                item.price
            ]);

            db.query(itemsSql, [values], (err) => {

                if (err) return res.status(500).json({ message: "Items error" });

                // 5️⃣ CLEAR CART
                db.query("DELETE FROM cart WHERE user_id = ?", [user_id]);

                res.json({
                    message: "Order placed successfully",
                    order_id: orderId
                });

            });

        });

    });

});

app.get("/getorders/:user_id", (req, res) => {

    const { user_id } = req.params;

    const sql = `
        SELECT 
            orders.*,
            order_items.*,
            products.product_name,
            products.image,
            products.status AS product_status
        FROM orders 
        INNER JOIN order_items 
            ON orders.order_id = order_items.order_id
        INNER JOIN products 
            ON products.product_id = order_items.product_id
        WHERE orders.user_id = ?
        ORDER BY orders.order_id DESC
    `;

    db.query(sql, [user_id], (err, results) => {
        if (err) {
            return res.status(500).json({ message: "DB error" });
        }

        res.json(results);
    });
});

app.get("/getorder/:order_id", (req, res) => {

    const { order_id } = req.params;


    const sql = `
        SELECT *
        FROM orders
        INNER JOIN order_items 
            ON orders.order_id = order_items.order_id
        INNER JOIN products 
            ON products.product_id = order_items.product_id
        WHERE orders.order_id = ?
    `;

    db.query(sql, [order_id], (err, results) => {

        if (err) return res.status(500).json({ message: "DB error" });


        res.json(results);
    });
});


app.get('/getallorders', (req, res) => {
    // orders.* gets everything from the order
    // users.name AS customer_name gives you a clear key for the UI
    const query = `
        SELECT orders.*, users.name AS customer_name 
        FROM orders
        JOIN users ON orders.user_id = users.user_id
        ORDER BY orders.created_at DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Database Error:", err);
            return res.status(500).json({ error: "Failed to fetch orders" });
        }
        res.json(results);
    });
});

// Route: /updateorderstatus/101/Delivered
app.get('/updateorderstatus/:id/:status', (req, res) => {
    const { id, status } = req.params;
    const sql = "UPDATE orders SET order_status = ? WHERE order_id = ?";

    db.query(sql, [status, id], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json({ message: "Status updated successfully", newStatus: status });
    });
});


// DELETE an order using GET method
app.get('/deleteorder/:orderId', (req, res) => {
    const { orderId } = req.params;

    if (!orderId) return res.status(400).json({ error: "Order ID is required" });

    // First, delete order items
    const deleteItemsSql = "DELETE FROM order_items WHERE order_id = ?";
    db.query(deleteItemsSql, [orderId], (err1) => {
        if (err1) {
            console.error(err1);
            return res.status(500).json({ error: "Database error while deleting items" });
        }

        // Then, delete the order itself
        const deleteOrderSql = "DELETE FROM orders WHERE order_id = ?";
        db.query(deleteOrderSql, [orderId], (err2, result) => {
            if (err2) {
                console.error(err2);
                return res.status(500).json({ error: "Database error while deleting order" });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Order not found" });
            }

            res.json({ message: "Order deleted successfully" });
        });
    });
});

app.listen(5000, () => {
    console.log(`Server running on http://localhost:5000`);
});